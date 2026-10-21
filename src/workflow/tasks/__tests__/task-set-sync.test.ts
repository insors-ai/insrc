import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { artifactJsonPath } from '../../storage.js';
import { row } from './task-kit.js';
import { PLAN, TASKS, alice, setKit, taskId, threeRows } from './task-set-kit.js';

describe('task-set-sync', () => {
	it('syncTasksOnPlanApproval creates the set for a new plan, reconciles a newer plan revision, does nothing when they agree and returns an error instead of throwing', async () => {
		const s = setKit();
		try {
			const path = artifactJsonPath(s.k.repo, PLAN);

			// no plan head yet, and a plan with bad rows: an error comes back, nothing throws, nothing is written
			assert.match(('error' in await s.sets.syncOnPlanApproval(path, alice) ? (await s.sets.syncOnPlanApproval(path, alice) as { error: string }).error : ''), /no head/);
			await s.plan([row('t1', 1), row('t2', 3, { dependsOn: [] })]);
			const bad = await s.sets.syncOnPlanApproval(path, alice);
			assert.ok('error' in bad && /order is not 1\.\.2/.test(bad.error), JSON.stringify(bad));
			assert.deepEqual(await s.k.store.childrenOf(`STORY-${'0123456789abcdef'}-s1`), []);

			// a new plan: the set is created
			await s.plan(threeRows());
			assert.deepEqual(await s.sets.syncOnPlanApproval(path, alice), { created: ['t1', 't2', 't3'], changed: [], withdrawn: [], added: [], closeFailed: [] });
			assert.equal((await s.k.store.read(taskId(2))).lifecycle.status, 'approved');

			// the same plan again: nothing is done, nothing is written
			const snap = async () => JSON.stringify(await Promise.all([TASKS, taskId(1), taskId(2), taskId(3)].map(id => s.k.store.readWithHistory(id))));
			const before = await snap();
			assert.deepEqual(await s.sets.syncOnPlanApproval(path, alice), { created: [], changed: [], withdrawn: [], added: [], closeFailed: [] });
			assert.equal(await snap(), before);

			// a newer plan revision is reconciled
			await s.plan([row('t1', 1, { summary: 'new words' }), row('t2', 2)]);
			assert.deepEqual(await s.sets.syncOnPlanApproval(path, alice), { created: [], changed: ['t1'], withdrawn: ['t3'], added: [], closeFailed: [] });
		} finally { s.done(); }
	});
});
