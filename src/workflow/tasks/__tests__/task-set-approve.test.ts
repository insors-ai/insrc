import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { approve } from '../../../cli/services/workflow.js';
import { followOnTasksSync } from '../../../daemon/tasks-sync.js';
import { approveJson } from '../../__tests__/helpers/approve.js';
import { approvalStateOf } from '../../artifact-core/approval-view.js';
import { _setAutoPushDepsForTests } from '../../tracker-auto.js';
import { ARTIFACTS_DIR } from '../../storage.js';
import { readBinding } from '../../tracker/binding.js';
import { _setTrackerExecForTests } from '../../tracker/__tests__/_legacy-table.js';
import type { TrackerPort } from '../../tracker/port.js';
import { HASH, CREATED, fakeTracker, seed, teamPolicy } from '../../__tests__/approve-fallback-kit.js';

const T = (n: number): string => `TASK-${HASH}-s1-t${n}`;

/** Every record carries the folder anchor a stored one has. */
function anchorAll(repo: string): void {
	const dir = join(repo, ARTIFACTS_DIR);
	for (const name of readdirSync(dir).filter(n => n.endsWith('.json'))) {
		const p = join(dir, name);
		const doc = JSON.parse(readFileSync(p, 'utf8'));
		doc.meta.epicCreatedAt = CREATED;
		writeFileSync(p, JSON.stringify(doc, null, 2) + '\n');
	}
}

/** The seeded plan's rows cite nothing; a real plan grounds every Task in a citation. */
function groundPlan(path: string, mutate?: (doc: any) => void): void {
	const doc = JSON.parse(readFileSync(path, 'utf8'));
	for (const task of doc.body.tasks) task.derivedFrom = ['c1'];
	doc.citations = [{ id: 'c1', kind: 'prior-artifact', ref: 'LLD s1' }];
	mutate?.(doc);
	writeFileSync(path, JSON.stringify(doc, null, 2) + '\n');
}

/** A fake tracker that remembers which issue each Task issue was linked under. */
function trackedFake() {
	const t = fakeTracker();
	const links: Array<{ parent: string; childId: number }> = [];
	const ops = (t.port as unknown as { issueOps: TrackerPort['issueOps'] }).issueOps;
	const link = ops.linkSubIssue;
	(ops as { linkSubIssue: TrackerPort['issueOps']['linkSubIssue'] }).linkSubIssue = (parent, childId) => { links.push({ parent, childId }); return link(parent, childId); };
	return { t, links };
}

const withPort = (t: ReturnType<typeof fakeTracker>): void => { _setAutoPushDepsForTests({ policy: teamPolicy, port: t.port }); _setTrackerExecForTests(() => ''); };

test("approving a plan creates the Task set and each Task's issue is bound on its Task head under the Story's issue, through the cli approve flow and the daemon seam, and a failed sync never fails the approval", async () => {
	// the cli approve flow
	const fx = seed({ pushTasks: false, taskHeads: false });
	try {
		anchorAll(fx.repo); groundPlan(fx.plan);
		const { t, links } = trackedFake();
		withPort(t);
		const out = await approve(fx.plan);
		assert.equal(out.approval.workflow, 'plan');
		assert.ok(out.tasks !== undefined && 'created' in out.tasks, JSON.stringify(out.tasks));
		assert.deepEqual(out.tasks && 'created' in out.tasks ? out.tasks.created : null, ['t1', 't2']);
		for (const n of [1, 2]) {
			const head = JSON.parse(readFileSync(join(fx.repo, ARTIFACTS_DIR, `${T(n)}.json`), 'utf8'));
			assert.equal(head.meta.lifecycle.status, 'approved', `Task t${n} is approved with the plan`);
			assert.equal(head.body.planTaskId, `t${n}`);
			const issue = readBinding(fx.repo, T(n))?.reference.entityId;
			assert.match(issue ?? '', /^acme\/demo#\d+$/, `Task t${n} has its issue on its head`);
		}
		// the Story's issue is acme/demo#2 (under the Epic, #1); both Task issues were linked under it
		assert.deepEqual(links.map(l => l.parent), ['acme/demo#1', 'acme/demo#2', 'acme/demo#2']);
		assert.equal(JSON.parse(readFileSync(fx.plan, 'utf8')).meta.tracker?.taskRefs, undefined, 'no Task record on the plan');
	} finally { fx.cleanup(); }

	// the daemon seam: the same set and the same bindings
	const fy = seed({ pushTasks: false, taskHeads: false });
	try {
		anchorAll(fy.repo); groundPlan(fy.plan);
		const { t, links } = trackedFake();
		withPort(t);
		const approval = await approveJson(fy.plan);
		const outcomes = await followOnTasksSync([{ path: approval.path, result: approval }], fy.repo);
		assert.equal(outcomes.length, 1);
		assert.deepEqual([outcomes[0]?.kind, outcomes[0]?.ok], ['tasks-sync', true], JSON.stringify(outcomes));
		assert.deepEqual(outcomes[0]?.tasks, { created: ['t1', 't2'], changed: [], withdrawn: [], added: [] });
		for (const n of [1, 2]) assert.match(readBinding(fy.repo, T(n))?.reference.entityId ?? '', /^acme\/demo#\d+$/);
		assert.deepEqual(links.map(l => l.parent), ['acme/demo#1', 'acme/demo#2', 'acme/demo#2']);
		// an approval that is not a plan fires nothing
		assert.deepEqual(await followOnTasksSync([{ path: fy.lld, result: approval }], fy.repo), []);
	} finally { fy.cleanup(); }

	// a plan whose rows cannot become Tasks: the approval stands, the failure is reported beside it, no Task head is made
	const fz = seed({ pushTasks: false, taskHeads: false });
	try {
		anchorAll(fz.repo); groundPlan(fz.plan, doc => { doc.body.tasks[1].order = 5; });
		const { t } = trackedFake();
		withPort(t);
		const out = await approve(fz.plan);
		assert.equal(out.approval.workflow, 'plan');
		assert.ok(out.tasks !== undefined && 'error' in out.tasks && /order is not 1\.\.2/.test(out.tasks.error), JSON.stringify(out.tasks));
		assert.equal(readdirSync(join(fz.repo, ARTIFACTS_DIR)).some(n => n.startsWith('TASK-')), false);
		assert.equal(approvalStateOf(JSON.parse(readFileSync(fz.plan, 'utf8')).meta), 'approved', 'the plan is approved');
		// the daemon seam reports it as a failed follow-on, not a throw
		const seam = await followOnTasksSync([{ path: fz.plan, result: { workflow: 'plan', path: fz.plan, approvedAt: 'x' } }], fz.repo);
		assert.deepEqual([seam[0]?.kind, seam[0]?.ok], ['tasks-sync', false]);
		assert.match(seam[0]?.note ?? '', /order is not 1\.\.2/);
	} finally { fz.cleanup(); }
});

test('task-set-approve.test.ts: plan approval syncs Task heads from the lifecycle approval', async () => {
	const fx = seed({ pushTasks: false, taskHeads: false });
	try {
		anchorAll(fx.repo); groundPlan(fx.plan);
		const { t } = trackedFake();
		withPort(t);
		// the gate approves the plan's lifecycle and writes no stamp of its own
		const approval = await approveJson(fx.plan);
		const plan = JSON.parse(readFileSync(fx.plan, 'utf8'));
		assert.equal(approvalStateOf(plan.meta), 'approved');
		assert.equal(plan.meta.approvedAt, undefined, 'the plan carries no legacy approval stamp');
		// the sync reads that approval and makes the Task heads approved with it
		const outcomes = await followOnTasksSync([{ path: approval.path, result: approval }], fx.repo);
		assert.deepEqual([outcomes[0]?.kind, outcomes[0]?.ok], ['tasks-sync', true], JSON.stringify(outcomes));
		assert.deepEqual(outcomes[0]?.tasks?.created, ['t1', 't2']);
		for (const n of [1, 2]) {
			const head = JSON.parse(readFileSync(join(fx.repo, ARTIFACTS_DIR, `${T(n)}.json`), 'utf8'));
			assert.equal(approvalStateOf(head.meta), 'approved', `Task t${n} is approved from the plan's approval`);
		}
	} finally { fx.cleanup(); }
});
