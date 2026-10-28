/**
 * The additive follow-on kinds of the approve pipeline (Story s10) carry their payloads: the whole Task reconciliation, the tracker
 * publication result and the commit result; and workflow.approvePipeline answers the approval with every entry.
 * Run: npx tsx --test-force-exit src/daemon/__tests__/workflow-approve-followon.test.ts
 */

import { afterEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { approvePipelineFollowOn } from '../approve-pipeline.js';
import { handleApprovePipeline } from '../workflow-approve.js';
import { approveJson } from '../../workflow/__tests__/helpers/approve.js';
import { _setAutoPushDepsForTests } from '../../workflow/tracker-auto.js';
import { ARTIFACTS_DIR } from '../../workflow/storage.js';
import { _setTrackerExecForTests } from '../../workflow/tracker/__tests__/_legacy-table.js';
import type { TrackerPort } from '../../workflow/tracker/port.js';
import { CREATED, fakeTracker, seed, teamPolicy } from '../../workflow/__tests__/approve-fallback-kit.js';

afterEach(() => { _setAutoPushDepsForTests(); _setTrackerExecForTests(); });

function prepare() {
	const fx = seed({ pushTasks: true, taskHeads: false });
	const dir = join(fx.repo, ARTIFACTS_DIR);
	for (const name of readdirSync(dir).filter(n => n.endsWith('.json'))) {
		const p = join(dir, name);
		const doc = JSON.parse(readFileSync(p, 'utf8'));
		doc.meta.epicCreatedAt = CREATED;
		if (p === fx.plan) { for (const task of doc.body.tasks) task.derivedFrom = ['c1']; doc.citations = [{ id: 'c1', kind: 'prior-artifact', ref: 'LLD s1' }]; }
		writeFileSync(p, JSON.stringify(doc, null, 2) + '\n');
	}
	const t = fakeTracker();
	_setAutoPushDepsForTests({ policy: teamPolicy, port: t.port as TrackerPort });
	_setTrackerExecForTests(() => '');
	return { fx, t };
}

describe('workflow-approve-followon.test.ts: the additive follow-on kinds carry their payloads', () => {
	it('tasks-sync carries the Task ids and the whole reconciliation, tracker-push the publication result, artifact-commit the commit result', async () => {
		const { fx } = prepare();
		try {
			const result = await approveJson(fx.plan);
			const out = await approvePipelineFollowOn([{ path: result.path, result }], { withTracker: true });
			const sync = out.find(e => e.kind === 'tasks-sync')!;
			assert.ok(Array.isArray(sync.tasks?.created) && sync.tasks.created.length > 0, JSON.stringify(sync));
			assert.deepEqual((sync.taskSync as { created: string[] }).created, sync.tasks.created);
			assert.ok('closeFailed' in (sync.taskSync as object));
			const push = out.find(e => e.kind === 'tracker-push')!;
			assert.ok((push.tracker as { status: string }).status.length > 0, JSON.stringify(push));
			const commit = out.find(e => e.kind === 'artifact-commit')!;
			assert.equal(typeof commit.commit?.committed, 'boolean');
			assert.equal(typeof commit.commit?.pushed, 'boolean');
			// every entry names the artifact it belongs to
			assert.ok(out.every(e => e.artifactPath === result.path));
		} finally { fx.cleanup(); }
	});

	it('handleApprovePipeline answers the approval and the entries of the follow-on it was given, and a bad request is an error', async () => {
		const { fx } = prepare();
		try {
			const seen: boolean[] = [];
			const followOnFor = (withTracker: boolean) => async () => { seen.push(withTracker); return []; };
			const ok = await handleApprovePipeline({ artifactPath: fx.plan, withTracker: false }, undefined, followOnFor);
			assert.ok(!('error' in ok), JSON.stringify(ok));
			assert.equal((ok as { approval: { workflow: string } }).approval.workflow, 'plan');
			assert.deepEqual(seen, [false]);
			assert.ok('error' in await handleApprovePipeline({}, undefined, followOnFor));
			assert.ok('error' in await handleApprovePipeline({ artifactPath: fx.plan, withTracker: 'yes' }, undefined, followOnFor));
		} finally { fx.cleanup(); }
	});
});
