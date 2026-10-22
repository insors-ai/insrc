import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { writeFileSync } from 'node:fs';

import { createCompletionEvidence } from '../../artifact-core/completion-evidence.js';
import { LifecycleService } from '../../artifact-core/lifecycle-service.js';
import { ArtifactNotFoundError } from '../../artifact-core/types.js';
import { artifact } from '../../artifact-core/__tests__/store-kit.js';
import { artifactJsonPath, buildArtifactId } from '../../storage.js';
import { PLAN, STORY, H, alice, bob, setKit, taskId, threeRows } from './task-set-kit.js';

describe('task-build-rounds', () => {
	it('a passing build round completes the Task, a later failing round does not, and the Story completes through the roll-up', async () => {
		const s = setKit();
		try {
			await s.plan(threeRows());
			await s.sets.createFromPlan(PLAN, alice);
			await s.k.store.write(artifact(STORY), alice);
			const evidence = createCompletionEvidence(s.k.repo);
			// the Story's code review is the user's to give; here it is overridden, so the roll-up rests on the Tasks' rounds alone
			const rolling = new LifecycleService({ store: s.k.store, evidence: { ...evidence, storyCodeReview: async () => ({ kind: 'overridden', overrideReason: 'accepted' }) } });

			// no round yet: the Task is not built
			assert.equal(await evidence.taskBuildPassed(taskId(1)), false);

			// a round is a log entry that moves no revision
			const rev = (await s.k.store.read(taskId(1))).lifecycle.revision.number;
			await s.sets.recordBuildRound(taskId(1), { passed: true, summary: 'tests and typecheck pass', data: { checks: 3 } }, bob);
			const head = await s.k.store.readWithHistory(taskId(1));
			assert.equal(head.lifecycle.revision.number, rev);
			const entry = head.changeLog.at(-1);
			assert.equal(entry?.operation, 'update');
			assert.equal(entry?.revision, undefined, 'the round moves no revision');
			assert.equal(entry?.actor.id, bob.id);
			assert.deepEqual([entry?.outcome?.result, entry?.outcome?.summary], ['pass', 'tests and typecheck pass']);
			assert.equal(await evidence.taskBuildPassed(taskId(1)), true);
			// another Task's passing round does not pass this one
			assert.equal(await evidence.taskBuildPassed(taskId(2)), false);

			// a later failing round un-passes it; a later pass passes it again
			await s.sets.recordBuildRound(taskId(1), { passed: false, summary: 'a test fails' }, bob);
			assert.equal(await evidence.taskBuildPassed(taskId(1)), false);
			await s.sets.recordBuildRound(taskId(1), { passed: true, summary: 'fixed' }, bob);
			assert.equal(await evidence.taskBuildPassed(taskId(1)), true);

			// the Task completes through the service, and the Story completes when the last Task does
			assert.deepEqual((await rolling.completeIfRolledUp(taskId(1), bob)).completed, [taskId(1)]);
			for (const n of [2, 3]) await s.sets.recordBuildRound(taskId(n), { passed: true, summary: 'ok' }, bob);
			assert.deepEqual((await rolling.completeIfRolledUp(taskId(2), bob)).completed, [taskId(2)]);
			assert.equal((await s.k.store.read(STORY)).lifecycle.status, 'draft');
			const last = await rolling.completeIfRolledUp(taskId(3), bob);
			assert.deepEqual(last.completed.slice(0, 2), [taskId(3), STORY]);
			assert.equal((await s.k.store.read(STORY)).lifecycle.status, 'completed');

			// a round for a Task with no head is refused
			await assert.rejects(s.sets.recordBuildRound(`TASK-${H}-s1-t9`, { passed: true, summary: 'x' }, bob), ArtifactNotFoundError);
		} finally { s.done(); }
	});

	it("a Task's build has passed by its own rounds, and a BUILD record's per-task result does not stand in for them", async () => {
		const s = setKit();
		try {
			await s.plan(threeRows());
			await s.sets.createFromPlan(PLAN, alice);
			writeFileSync(artifactJsonPath(s.k.repo, buildArtifactId(H, 's1')), JSON.stringify({ meta: {}, body: { tasks: [{ id: 't1', passed: true }, { id: 't9', passed: true }] } }));
			const evidence = createCompletionEvidence(s.k.repo);
			assert.equal(await evidence.taskBuildPassed(`TASK-${H}-s1-t9`), false, 'no head: the BUILD record is not read');
			assert.equal(await evidence.taskBuildPassed(taskId(1)), false, 'a head with no round is not passed by the BUILD record');
		} finally { s.done(); }
	});
});
