import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';

import { _mutateEpicTrackerMeta } from '../../orchestrator.js';
import { assemblePushContext } from '../../runners/tracker/context.js';
import { artifactJsonPath, defineArtifactId } from '../../storage.js';
import { bindArtifact, readBinding } from '../../tracker/binding.js';
import { patchTrackerMeta, readTrackerMeta } from '../../tracker/refs.js';
import { resolveWorkflowRef } from '../../tracker/resolve.js';
import type { StepRunnerContext } from '../../types.js';
import type { TaskPayload } from '../types.js';
import { HASH, CREATED, SLUG, seed } from '../../__tests__/approve-fallback-kit.js';
import { approvedMeta } from '../../__tests__/lifecycle-fixtures.js';

const HEAD = `TASK-${HASH}-s1-t4`;

function writeHead(repo: string, id: string, rowId: string, status?: string): void {
	const body: TaskPayload = { title: 'Filter the list', summary: 's', size: 'S', order: 2, acceptanceChecks: ['filters'], tests: [], planTaskId: rowId };
	writeFileSync(artifactJsonPath(repo, id), JSON.stringify({
		meta: { workflow: 'plan', runId: 'r', repoPath: repo, createdAt: CREATED, epicCreatedAt: CREATED, schemaVersion: 1, epicHash: HASH, storyId: 's1', epicSlug: SLUG, ...(status !== undefined ? { lifecycle: { status } } : {}) },
		body, citations: [],
	}, null, 2) + '\n');
}

test("an issue number resolves to a Task through its head's binding, the tracker runner's dedup read and the orchestrator's push result use the head, and a Task with no head is not resolved through the Plan", async () => {
	const fx = seed({ pushTasks: true, taskHeads: false });
	try {
		// plan row t2 became Task t4 (bound to #7); row t1 has no Task artifact, and a record the plan holds for it (#9) is not read
		writeHead(fx.repo, HEAD, 't2');
		assert.ok(bindArtifact(fx.repo, HEAD, 'acme/demo#7').ok);
		patchTrackerMeta(fx.plan, { units: { 'task:s1/t1': { unit: 'task', unitId: 't1', issue: 'acme/demo#9', createdAtRevision: 1 } } });

		// an issue number, the Task's number, its plan row and its artifact id all name the Task artifact
		for (const id of ['#7', 'acme/demo#7', 's1/t4', 's1/t2', HEAD]) {
			const r = resolveWorkflowRef(fx.repo, id, { epicHash: HASH });
			assert.equal(r?.level, 'task', id);
			assert.equal(r?.workflowId, HEAD, id);
			assert.equal(r?.taskId, 't2', `${id}: the plan row id is what the plan and the build record call it`);
			assert.equal(r?.issueRef, 'acme/demo#7', id);
			assert.equal(r?.task?.id, 't2', id);
		}
		// a Task with no artifact has no issue to resolve: the plan's record is not read
		assert.equal(resolveWorkflowRef(fx.repo, '#9', { epicHash: HASH }), null);
		assert.equal(resolveWorkflowRef(fx.repo, 's1/t1', { epicHash: HASH })?.issueRef, undefined);

		// the tracker runner's dedup read: the head's binding, by plan row
		const define = artifactJsonPath(fx.repo, defineArtifactId(HASH));
		const d = JSON.parse(readFileSync(define, 'utf8'));
		Object.assign(d.meta, approvedMeta({ at: '2026-07-18T00:00:00.000Z' }));
		writeFileSync(define, JSON.stringify(d));
		const plan = JSON.parse(readFileSync(fx.plan, 'utf8'));
		Object.assign(plan.meta, approvedMeta({ at: '2026-07-18T00:00:00.000Z' }));
		writeFileSync(fx.plan, JSON.stringify(plan));
		const ctx = { intent: { repoPath: fx.repo, workflow: 'tracker.push', params: { epicHash: HASH } } } as unknown as StepRunnerContext;
		assert.deepEqual((await assemblePushContext(ctx)).existingRefs?.taskRefs, { s1: { t2: 'acme/demo#7' } });

		// the push result: a Task with an artifact is bound on it, one without is not recorded anywhere
		const other = writeAndBind(fx.repo);
		_mutateEpicTrackerMeta(fx.repo, HASH, 'tracker.push', { epicRef: 'acme/demo#1', storyRefs: { s1: 'acme/demo#2' }, labelsCreated: [], taskRefs: { s1: { t1: 'acme/demo#11', t2: 'acme/demo#12' } } } as never);
		assert.equal(readBinding(fx.repo, HEAD)?.reference.entityId, 'acme/demo#7', 'a bound Task keeps its issue');
		assert.equal(readTrackerMeta(fx.plan)?.taskRefs?.['t2'], undefined, 'no record of a Task with an artifact is written on the plan');
		assert.equal(readTrackerMeta(fx.plan)?.taskRefs, undefined, 'and none is written for a Task with no artifact');
		assert.equal(readBinding(fx.repo, other)?.reference.entityId, 'acme/demo#13');

		// a withdrawn Task artifact is not found by its closed issue
		writeHead(fx.repo, HEAD, 't2', 'withdrawn');
		assert.equal(resolveWorkflowRef(fx.repo, '#7', { epicHash: HASH }), null);
	} finally { fx.cleanup(); }
});

/** A second Task artifact (t5, for plan row t3) with no issue yet; the push gives it #13. */
function writeAndBind(repo: string): string {
	const id = `TASK-${HASH}-s1-t5`;
	writeHead(repo, id, 't3');
	assert.ok(bindArtifact(repo, id, 'acme/demo#13').ok);
	return id;
}
