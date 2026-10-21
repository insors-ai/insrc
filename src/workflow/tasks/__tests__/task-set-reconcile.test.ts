import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { bindArtifact } from '../../tracker/binding.js';
import { TaskSetError } from '../types.js';
import type { TaskPayload, TasksPayload } from '../types.js';
import type { CloseIssue } from '../task-set.js';
import { row } from './task-kit.js';
import { PLAN, TASKS, alice, setKit, taskId, threeRows } from './task-set-kit.js';

const closer = (calls: string[], fail?: () => string | undefined): CloseIssue => issue => {
	calls.push(issue);
	const why = fail?.();
	return why === undefined ? { ok: true } : { ok: false, reason: why };
};

describe('task-set-reconcile', () => {
	it('a re-plan revises a changed Task, withdraws a dropped Task and closes its issue, adds a new Task under the next number, and never reuses an id', async () => {
		const s = setKit();
		try {
			await s.plan(threeRows());
			await s.sets.createFromPlan(PLAN, alice);
			assert.ok(bindArtifact(s.k.repo, taskId(3), 'acme/demo#3').ok);

			// v2: t1 is reworded, t2 stays, t3 is dropped, a new row t9 is added
			await s.plan([row('t1', 1, { summary: 'reworded' }), row('t2', 2), row('t9', 3, { dependsOn: ['t2'] })]);
			const closed: string[] = [];
			const r = await s.sets.reconcile(PLAN, alice, { closeIssue: closer(closed) });
			assert.deepEqual(r, { changed: ['t1'], withdrawn: ['t3'], added: ['t4'], closeFailed: [] });
			assert.deepEqual(closed, ['acme/demo#3']);

			const t1 = await s.k.store.read(taskId(1));
			assert.equal((t1.payload.body as unknown as TaskPayload).summary, 'reworded');
			assert.equal(t1.lifecycle.revision.number, 2, 'a changed Task gets a new revision');
			assert.equal(t1.lifecycle.status, 'approved', 'and is approved again with the plan');
			// an unchanged Task keeps its revision; its reference follows the plan
			const t2 = await s.k.store.read(taskId(2));
			assert.equal(t2.lifecycle.revision.number, 1);
			assert.equal(t2.references.find(x => x.relation === 'derived-from')?.fragment, 'revision 2');
			assert.equal((await s.k.store.read(taskId(3))).lifecycle.status, 'withdrawn');
			const t4 = await s.k.store.read(taskId(4));
			assert.equal((t4.payload.body as unknown as TaskPayload).planTaskId, 't9');
			assert.equal(t4.lifecycle.status, 'approved');
			assert.deepEqual(t4.references.filter(x => x.relation === 'depends-on').map(x => x.entityId), [taskId(2)]);
			assert.deepEqual((await s.k.store.read(TASKS)).payload.body as unknown as TasksPayload, { planRevision: 2, taskIds: ['t1', 't2', 't3', 't4'], nextNumber: 5 });

			// a row that comes back is a new Task: the withdrawn id is not revived or reused
			await s.plan([row('t1', 1, { summary: 'reworded' }), row('t2', 2), row('t9', 3, { dependsOn: ['t2'] }), row('t3', 4, { dependsOn: ['t9'] })]);
			const again = await s.sets.reconcile(PLAN, alice, { closeIssue: closer(closed) });
			assert.deepEqual(again, { changed: [], withdrawn: [], added: ['t5'], closeFailed: [] });
			assert.equal((await s.k.store.read(taskId(3))).lifecycle.status, 'withdrawn');
			assert.equal(((await s.k.store.read(taskId(5))).payload.body as unknown as TaskPayload).planTaskId, 't3');
			assert.deepEqual(((await s.k.store.read(TASKS)).payload.body as unknown as TasksPayload).taskIds, ['t1', 't2', 't3', 't4', 't5']);

			// the same plan revision again does nothing
			const same = JSON.stringify(await s.k.store.readWithHistory(TASKS));
			assert.deepEqual(await s.sets.reconcile(PLAN, alice, { closeIssue: closer(closed) }), { changed: [], withdrawn: [], added: [], closeFailed: [] });
			assert.equal(JSON.stringify(await s.k.store.readWithHistory(TASKS)), same);
		} finally { s.done(); }
	});

	it('a dropped Task whose issue cannot be closed is withdrawn anyway, the failure is returned, and the next call retries the close', async () => {
		const s = setKit();
		try {
			await s.plan(threeRows());
			await s.sets.createFromPlan(PLAN, alice);
			assert.ok(bindArtifact(s.k.repo, taskId(3), 'acme/demo#3').ok);
			await s.plan([row('t1', 1), row('t2', 2)]);

			let offline = true;
			const calls: string[] = [];
			const r = await s.sets.reconcile(PLAN, alice, { closeIssue: closer(calls, () => offline ? 'offline' : undefined) });
			assert.deepEqual(r.withdrawn, ['t3']);
			assert.deepEqual(r.closeFailed, [{ taskId: 't3', issue: 'acme/demo#3', reason: 'offline' }]);
			assert.equal((await s.k.store.read(taskId(3))).lifecycle.status, 'withdrawn');

			// still offline: the retry fails again and is returned; back online: it closes once and is not retried again
			assert.equal((await s.sets.reconcile(PLAN, alice, { closeIssue: closer(calls, () => offline ? 'offline' : undefined) })).closeFailed.length, 1);
			offline = false;
			assert.deepEqual((await s.sets.reconcile(PLAN, alice, { closeIssue: closer(calls) })).closeFailed, []);
			const n = calls.length;
			await s.sets.reconcile(PLAN, alice, { closeIssue: closer(calls) });
			assert.equal(calls.length, n, 'a closed issue is not closed again');
		} finally { s.done(); }
	});

	it('reconcile refuses a plan with no Tasks file yet and a plan behind the Tasks', async () => {
		const s = setKit();
		try {
			await s.plan(threeRows());
			await assert.rejects(s.sets.reconcile(PLAN, alice), /use createFromPlan/);
			await s.sets.createFromPlan(PLAN, alice);
			await s.plan([row('t1', 1), row('t2', 2)]);
			await s.sets.reconcile(PLAN, alice);
			// the Tasks file now records revision 2; a plan head read at revision 1 cannot be reconciled
			await s.k.store.update(TASKS, alice, c => { const { changeLog: _l, ...h } = c; return { next: { ...h, payload: { ...h.payload, body: { ...h.payload.body, planRevision: 9 } } } }; });
			await assert.rejects(s.sets.reconcile(PLAN, alice), (e: Error) => e instanceof TaskSetError && /behind/.test(e.message));
		} finally { s.done(); }
	});
});
