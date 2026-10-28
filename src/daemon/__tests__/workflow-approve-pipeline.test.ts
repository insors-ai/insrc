/**
 * The approve pipeline at the daemon (Story s10): withTracker false stops after the approval and the Task reconciliation, a plan
 * approval publishes exactly once, and a denial at publication stops the check-in commit and the attachment.
 * Run: npx tsx --test-force-exit src/daemon/__tests__/workflow-approve-pipeline.test.ts
 */

import { afterEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { approvePipelineFollowOn } from '../approve-pipeline.js';
import { approveJson } from '../../workflow/__tests__/helpers/approve.js';
import { _setAutoPushDepsForTests } from '../../workflow/tracker-auto.js';
import { ARTIFACTS_DIR } from '../../workflow/storage.js';
import { _setTrackerExecForTests } from '../../workflow/tracker/__tests__/_legacy-table.js';
import type { TrackerPort } from '../../workflow/tracker/port.js';
import { ToolDenied } from '../../workflow/tracker/tool-denied.js';
import { CREATED, fakeTracker, seed, teamPolicy } from '../../workflow/__tests__/approve-fallback-kit.js';

function anchorAll(repo: string): void {
	const dir = join(repo, ARTIFACTS_DIR);
	for (const name of readdirSync(dir).filter(n => n.endsWith('.json'))) {
		const p = join(dir, name);
		const doc = JSON.parse(readFileSync(p, 'utf8'));
		doc.meta.epicCreatedAt = CREATED;
		writeFileSync(p, JSON.stringify(doc, null, 2) + '\n');
	}
}

afterEach(() => { _setAutoPushDepsForTests(); _setTrackerExecForTests(); });

async function planApproved(pushTasks: boolean) {
	const fx = seed({ pushTasks, taskHeads: false });
	anchorAll(fx.repo);
	const doc = JSON.parse(readFileSync(fx.plan, 'utf8'));
	for (const task of doc.body.tasks) task.derivedFrom = ['c1'];
	doc.citations = [{ id: 'c1', kind: 'prior-artifact', ref: 'LLD s1' }];
	writeFileSync(fx.plan, JSON.stringify(doc, null, 2) + '\n');
	const t = fakeTracker();
	_setAutoPushDepsForTests({ policy: teamPolicy, port: t.port as TrackerPort });
	_setTrackerExecForTests(() => '');
	const result = await approveJson(fx.plan);
	return { fx, t, approved: [{ path: result.path, result }] };
}

describe('workflow-approve-pipeline.test.ts: withTracker false stops after approval and Task reconciliation; a plan approval publishes exactly once; a denial at publication stops the check-in commit and attach', () => {
	it('withTracker false reconciles the Tasks and does nothing after: no publication, no commit, no attachment', async () => {
		const { fx, t, approved } = await planApproved(true);
		try {
			const out = await approvePipelineFollowOn(approved, { withTracker: false });
			assert.deepEqual(out.map(e => e.kind), ['tasks-sync']);
			assert.equal(out[0]!.ok, true, JSON.stringify(out[0]));
			assert.equal(t.log.creates, 0, 'nothing was published');
		} finally { fx.cleanup(); }
	});

	it('a plan approval publishes the Task issues exactly once: one tracker-push entry, and the reconciliation entry does not publish', async () => {
		const { fx, t, approved } = await planApproved(true);
		try {
			const out = await approvePipelineFollowOn(approved, { withTracker: true });
			assert.deepEqual(out.map(e => e.kind).slice(0, 3), ['tasks-sync', 'tracker-push', 'artifact-commit']);
			assert.equal(out.filter(e => e.kind === 'tracker-push').length, 1);
			const made = t.log.creates;
			assert.ok(made > 0, 'the Task issues were created');
			// the same pipeline again creates nothing new: the issues are bound
			await approvePipelineFollowOn(approved, { withTracker: true });
			assert.equal(t.log.creates, made);
		} finally { fx.cleanup(); }
	});

	it('a denial at publication is a tracker-push entry with ok false and the denial, and the check-in commit and the attachment do not run', async () => {
		const { fx, t, approved } = await planApproved(true);
		try {
			(t.port.issueOps as unknown as Record<string, unknown>)['create'] = () => { throw new ToolDenied('gh_tracker', 'declined'); };
			const out = await approvePipelineFollowOn(approved, { withTracker: true });
			assert.deepEqual(out.map(e => e.kind), ['tasks-sync', 'tracker-push']);
			assert.equal(out[1]!.ok, false);
			assert.deepEqual(out[1]!.denied, { toolId: 'gh_tracker', reason: 'declined' });
			assert.match(out[1]!.note ?? '', /the publication stopped: gh_tracker was denied/);
		} finally { fx.cleanup(); }
	});
});
