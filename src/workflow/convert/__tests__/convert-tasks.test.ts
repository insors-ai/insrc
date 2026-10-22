import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';

import { History } from '../../artifact-core/history.js';
import type { Actor } from '../../artifact-core/types.js';
import { artifact, alice } from '../../artifact-core/__tests__/store-kit.js';
import { artifactJsonPath } from '../../storage.js';
import { readBinding } from '../../tracker/binding.js';
import { unitKey } from '../../tracker/unit-issue.js';
import { H, PLAN, setKit, threeRows, TASKS, taskId } from '../../tasks/__tests__/task-set-kit.js';
import { readRawHeads } from '../raw-heads.js';
import { applyTasks, roundEntryId, tasksRule } from '../tasks.js';
import type { ConversionDeps } from '../types.js';

const MIGRATION: Actor = { id: 'insrc:migration', kind: 'system', properties: {} };
const BUILD = `BUILD-${H}-s1`;
const PLAN2 = `PLAN-${H}-s2`;

describe('convert-tasks', () => {
	it('convert-tasks.test.ts: Task heads and passed build rounds are created and createFromPlan alone moves the Task record', async () => {
		const kit = setKit();
		try {
			await kit.plan(threeRows());
			// the legacy state: the Plan holds the Task record of t1, and the BUILD record holds the task results
			const planPath = artifactJsonPath(kit.k.repo, PLAN);
			const planHead = JSON.parse(readFileSync(planPath, 'utf8'));
			const key = unitKey({ unit: 'task', repoPath: kit.k.repo, epicHash: H, storyId: 's1', taskId: 't1' });
			planHead.meta.tracker = { units: { [key]: { issue: 'o/r#7' } } };
			writeFileSync(planPath, JSON.stringify(planHead, null, 2) + '\n');
			writeFileSync(artifactJsonPath(kit.k.repo, BUILD), JSON.stringify({ meta: { workflow: 'build', epicHash: H, storyId: 's1', createdAt: '2026-10-03T00:00:00.000Z' },
				body: { tasks: [{ id: 't1', passed: true }, { id: 't2', passed: false }, { id: 't3', passed: true }] }, citations: [] }) + '\n');
			// a second Story whose PLAN is not approved
			await kit.k.store.write(artifact(PLAN2, { payload: { body: { tasks: threeRows() } as unknown as Record<string, unknown>, citations: [] } }), alice);

			const history = new History(kit.k.sidecar);
			const deps = { store: kit.k.store, history, taskSets: kit.sets, now: () => new Date('2026-10-22T00:00:00.000Z'), actor: MIGRATION } as unknown as ConversionDeps;
			const plan = await tasksRule({ repo: kit.k.repo, heads: readRawHeads(kit.k.repo).heads });
			assert.deepEqual(plan.changes?.map(c => [c.rule, c.artifactId, c.detail]), [['create-tasks', PLAN, '3 tasks, 2 passed rounds']]);

			const planBefore = readFileSync(planPath, 'utf8');
			const result = await applyTasks(kit.k.repo, deps);
			assert.deepEqual(result.sets, [TASKS]);
			assert.deepEqual(result.rounds, [taskId(1), taskId(3)]);

			// Task heads exist with a binding moved by createFromPlan alone (t1 only) and the passed rounds; t2's failed result gives no round
			assert.equal(readBinding(kit.k.repo, taskId(1))?.reference.entityId, 'o/r#7');
			assert.equal(readBinding(kit.k.repo, taskId(2)), undefined);
			const rounds = async (n: number) => (await history.log(taskId(n))).filter(e => (e.outcome?.data as { kind?: string } | undefined)?.kind === 'build-round');
			assert.deepEqual((await rounds(1)).map(e => [e.id, e.outcome?.result, e.revision, e.timestamp]), [[roundEntryId(taskId(1)), 'pass', undefined, '2026-10-03T00:00:00.000Z']]);
			assert.deepEqual(await rounds(2), []);
			assert.equal((await rounds(3)).length, 1);
			assert.equal((await kit.k.store.read(taskId(1))).lifecycle.status, 'approved');
			// the unapproved PLAN got nothing, and the conversion left the Plan's own copy of the record where it was
			assert.deepEqual(await kit.k.store.read(`TASKS-${H}-s2`).then(() => 'head', () => 'none'), 'none');
			assert.equal(readFileSync(planPath, 'utf8'), planBefore);

			// a repeat creates nothing and appends nothing
			assert.deepEqual(await applyTasks(kit.k.repo, deps), { sets: [], rounds: [] });
			assert.equal((await rounds(1)).length, 1);
			assert.deepEqual((await tasksRule({ repo: kit.k.repo, heads: readRawHeads(kit.k.repo).heads })).changes, []);
		} finally { kit.done(); }
	});
});
