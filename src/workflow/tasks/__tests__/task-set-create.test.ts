import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { ArtifactIds } from '../../artifact-ids.js';
import { emptyLifecycle } from '../../artifact-core/decode.js';
import { artifactJsonPath } from '../../storage.js';
import { readBinding } from '../../tracker/binding.js';
import { patchTrackerMeta } from '../../tracker/refs.js';
import { TaskSetError } from '../types.js';
import type { TaskPayload, TasksPayload } from '../types.js';
import { row } from './task-kit.js';
import { PLAN, STORY, TASKS, alice, setKit, taskId, threeRows } from './task-set-kit.js';

describe('task-set-create', () => {
	it('createFromPlan writes the Tasks file and one approved Task head per plan Task with parent, dependencies and a derived-from reference, and a repeat writes nothing', async () => {
		const s = setKit();
		try {
			await s.plan(threeRows());
			const set = await s.sets.createFromPlan(PLAN, alice);

			// the Tasks file names the Tasks, the plan revision and the next number
			assert.equal(set.id, TASKS);
			const file = await s.k.store.read(TASKS);
			assert.deepEqual(file.payload.body as unknown as TasksPayload, { planRevision: 1, taskIds: ['t1', 't2', 't3'], nextNumber: 4 });
			assert.equal(file.parent?.entityId, STORY);

			// one approved Task head per row, in plan order, with its payload, parent and references
			assert.deepEqual(set.tasks.map(t => t.id), [taskId(1), taskId(2), taskId(3)]);
			for (const [i, t] of set.tasks.entries()) {
				const head = await s.k.store.read(t.id);
				const body = head.payload.body as unknown as TaskPayload;
				assert.equal(body.planTaskId, `t${i + 1}`);
				assert.equal(body.title, `Task t${i + 1}`);
				assert.equal(head.lifecycle.status, 'approved', 'the plan\'s approval covers its Tasks');
				assert.equal(head.lifecycle.approval?.by.id, alice.id);
				assert.equal(head.parent?.entityId, STORY);
				assert.deepEqual(head.references.filter(r => r.relation === 'derived-from').map(r => [r.entityId, r.fragment]), [[PLAN, 'revision 1']]);
			}
			const third = await s.k.store.read(taskId(3));
			assert.deepEqual(third.references.filter(r => r.relation === 'depends-on').map(r => r.entityId), [taskId(1), taskId(2)]);
			assert.deepEqual((await s.k.store.childrenOf(STORY)).filter(id => ArtifactIds.parse(id)?.kind === 'TASK'), [taskId(1), taskId(2), taskId(3)]);

			// a repeat for the same plan revision writes nothing
			const snapshot = async () => JSON.stringify(await Promise.all([TASKS, taskId(1), taskId(2), taskId(3)].map(id => s.k.store.readWithHistory(id))));
			const before = await snapshot();
			const again = await s.sets.createFromPlan(PLAN, alice);
			assert.equal(await snapshot(), before);
			assert.deepEqual(again.tasks.map(t => t.id), set.tasks.map(t => t.id));
		} finally { s.done(); }
	});

	it('a plan with no Tasks writes a Tasks file with no ids, and a plan that is not approved or has bad rows makes nothing', async () => {
		const s = setKit();
		try {
			await s.plan([]);
			const set = await s.sets.createFromPlan(PLAN, alice);
			assert.deepEqual(set.tasks, []);
			assert.deepEqual((await s.k.store.read(TASKS)).payload.body, { planRevision: 1, taskIds: [], nextNumber: 1 });
		} finally { s.done(); }

		const bad = setKit();
		try {
			// a plan that has no head, then one with an order gap: nothing is written
			await assert.rejects(bad.sets.createFromPlan(PLAN, alice), TaskSetError);
			await bad.plan([row('t1', 1), row('t2', 3, { dependsOn: [] })]);
			await assert.rejects(bad.sets.createFromPlan(PLAN, alice), /order is not 1\.\.2/);
			assert.deepEqual(await bad.k.store.childrenOf(STORY), []);
			await assert.rejects(bad.k.store.read(TASKS));
		} finally { bad.done(); }
	});

	it('a Task head left by an earlier run is kept, the plan\'s Task record moves onto its head, and a newer plan revision is left to reconcile', async () => {
		const s = setKit();
		try {
			await s.plan(threeRows());
			// an earlier run made t1 and stopped: its head is kept as it is, not rewritten
			await s.k.store.write({
				id: taskId(1), description: 'Task t1', parent: { entityId: STORY, type: 'STORY', relation: 'derived-from' }, references: [], attachments: [],
				lifecycle: emptyLifecycle(0), payload: { body: { title: 'Task t1', summary: 'does t1', size: 'S', order: 1, acceptanceChecks: ['it works'], tests: [{ level: 'unit', name: 't1.test.ts: works' }], planTaskId: 't1' }, citations: [] },
			}, alice);
			const planJson = artifactJsonPath(s.k.repo, PLAN);
			patchTrackerMeta(planJson, { units: { 'task:s1/t2': { unit: 'task', unitId: 't2', issue: 'acme/demo#5', createdAtRevision: 1 } } });

			const set = await s.sets.createFromPlan(PLAN, alice);
			assert.deepEqual(set.tasks.map(t => t.id), [taskId(1), taskId(2), taskId(3)]);
			assert.equal((await s.k.store.read(taskId(1))).lifecycle.status, 'approved');
			assert.equal(readBinding(s.k.repo, taskId(2))?.reference.entityId, 'acme/demo#5', 'the plan\'s record is on the Task head\'s binding');
			assert.equal(readBinding(s.k.repo, taskId(3)), undefined);

			// the plan moves to a newer revision: createFromPlan does not reconcile it
			await s.k.store.write({ ...(await s.k.store.read(PLAN)), description: 'a re-plan' }, alice);
			await s.service.apply(PLAN, 'approve', alice).catch(() => undefined);
			await assert.rejects(s.sets.createFromPlan(PLAN, alice), /use reconcile/);
		} finally { s.done(); }
	});
});
