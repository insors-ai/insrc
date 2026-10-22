import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';

import { artifactJsonPath } from '../../storage.js';
import { ensureDraftIssues } from '../../draft-issues.js';
import { autoPushTasksOnPlan } from '../../tracker-auto.js';
import { readBinding } from '../../tracker/binding.js';
import { patchTrackerMeta, readTrackerMeta } from '../../tracker/refs.js';
import { ensureUnitIssueDetailed, resolveUnitIssueLocal, unitLabel } from '../../tracker/unit-issue.js';
import type { TaskPayload } from '../types.js';
import { HASH, CREATED, SLUG, fakeTracker, seed, teamPolicy, via } from '../../__tests__/approve-fallback-kit.js';

const HEAD = `TASK-${HASH}-s1-t4`;
const unit = (taskId: string) => ({ unit: 'task' as const, repoPath: '', epicHash: HASH, storyId: 's1', taskId });

/** A Task head for plan row `rowId`, as the Task set writes one (its number can differ from the row's id after a re-plan). */
function writeHead(repo: string, id: string, rowId: string, status?: string): void {
	const body: TaskPayload = { title: 'Filter the list', summary: 's', size: 'S', order: 2, acceptanceChecks: ['filters'], tests: [], planTaskId: rowId };
	writeFileSync(artifactJsonPath(repo, id), JSON.stringify({
		meta: { workflow: 'plan', runId: 'r', repoPath: repo, createdAt: CREATED, epicCreatedAt: CREATED, schemaVersion: 1, epicHash: HASH, storyId: 's1', epicSlug: SLUG, ...(status !== undefined ? { lifecycle: { status } } : {}) },
		body, citations: [],
	}, null, 2) + '\n');
}

test("a Task's issue is created under the Story's issue and bound on its Task head with no record on the Plan, the draft hook claims the Epic and the Story only, and a Task with no head is not resolved through the Plan", () => {
	const fx = seed({ pushTasks: false, taskHeads: false });
	try {
		const t = fakeTracker();
		const u = (id: string) => ({ ...unit(id), repoPath: fx.repo });
		assert.equal(ensureUnitIssueDetailed({ unit: 'epic', repoPath: fx.repo, epicHash: HASH }, t.port).ok, true);
		assert.equal(ensureUnitIssueDetailed({ unit: 'story', repoPath: fx.repo, epicHash: HASH, storyId: 's1' }, t.port).ok, true);

		// plan row t2 became Task t4 (a re-plan); row t1 has no Task artifact
		writeHead(fx.repo, HEAD, 't2');
		assert.equal(unitLabel(u('t2')), `insrc:unit:${HASH}:s1:t4`, 'the label uses the Task artifact\'s number');
		assert.equal(unitLabel(u('t1')), `insrc:unit:${HASH}:s1:t1`, 'a row with no Task artifact keeps its row id');

		const made = ensureUnitIssueDetailed(u('t2'), t.port);
		assert.ok(made.ok && made.value.created);
		const ref = made.ok ? made.value.issue : '';
		assert.equal(readBinding(fx.repo, HEAD)?.reference.entityId, ref, 'bound on the Task head');
		assert.equal(t.issues.find(i => i.ref === ref)?.spec.title.startsWith(`${HEAD} — `), true, 'titled with the Task artifact\'s id');
		const planMeta = readTrackerMeta(fx.plan);
		assert.equal(planMeta?.units?.['task:s1/t2'], undefined, 'no Task record on the Plan');
		assert.equal(planMeta?.taskRefs?.['t2'], undefined);
		// a second ensure creates nothing
		const creates = t.log.creates;
		assert.equal(ensureUnitIssueDetailed(u('t2'), t.port).ok, true);
		assert.equal(t.log.creates, creates);

		// a Task with no head has nowhere to be recorded: nothing is created for it, and nothing is written on the Plan
		const creates1 = t.log.creates;
		const old = ensureUnitIssueDetailed(u('t1'), t.port);
		assert.equal(old.ok, false);
		assert.match(old.ok ? '' : old.reason, /no Task artifact yet/);
		assert.equal(t.log.creates, creates1);
		assert.equal(readTrackerMeta(fx.plan)?.taskRefs, undefined);
		assert.equal(resolveUnitIssueLocal(u('t1')), null);
		// a withdrawn Task artifact is not the row's Task any more
		writeHead(fx.repo, HEAD, 't2', 'withdrawn');
		assert.equal(unitLabel(u('t2')), `insrc:unit:${HASH}:s1:t2`);
	} finally { fx.cleanup(); }

	// the plan draft claims the Epic and the Story only: no Task issue is made before the plan is approved
	const fy = seed({ pushTasks: false, taskHeads: false });
	try {
		const t = fakeTracker();
		const r = ensureDraftIssues(fy.plan, { readPolicy: teamPolicy, loadTracker: () => ({ ok: true, value: t.port }) });
		assert.equal(r.status, 'ready');
		assert.deepEqual(r.status === 'ready' ? r.units.map(x => x.unit) : null, ['epic', 'story:s1']);
		assert.equal(t.log.creates, 2);
	} finally { fy.cleanup(); }

	// a Task with no head is not resolved through a record the Plan holds, and the Plan is not changed by the lookup
	const fz = seed({ pushTasks: false, taskHeads: false });
	try {
		patchTrackerMeta(fz.plan, { units: { 'task:s1/t1': { unit: 'task', unitId: 't1', issue: 'acme/demo#9', createdAtRevision: 1 } } });
		const before = readFileSync(fz.plan, 'utf8');
		assert.equal(resolveUnitIssueLocal({ ...unit('t1'), repoPath: fz.repo }), null);
		assert.equal(readFileSync(fz.plan, 'utf8'), before);
	} finally { fz.cleanup(); }
});
