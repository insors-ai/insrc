/**
 * Through the real syncPlanTasks (Story s10): a denied close of a dropped Task's issue escapes as a TaskSyncDenied carrying what was done,
 * the daemon follow-on reports it as a failed entry instead of crashing the approval, and the next call finishes the work.
 * Run: npx tsx --test-force-exit src/daemon/__tests__/sync-plan-tasks-denial.test.ts
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { followOnTasksSync, syncPlanTasks } from '../tasks-sync.js';
import { approveJson } from '../../workflow/__tests__/helpers/approve.js';
import { createRepoLifecycle } from '../../workflow/artifact-core/repo-lifecycle.js';
import { _setAutoPushDepsForTests } from '../../workflow/tracker-auto.js';
import { ARTIFACTS_DIR, planArtifactId } from '../../workflow/storage.js';
import { readBinding } from '../../workflow/tracker/binding.js';
import { _setTrackerExecForTests } from '../../workflow/tracker/github.js';
import { TaskSyncDenied, ToolDenied } from '../../workflow/tracker/tool-denied.js';
import type { TrackerPort } from '../../workflow/tracker/port.js';
import { CREATED, HASH, fakeTracker, seed, teamPolicy } from '../../workflow/__tests__/approve-fallback-kit.js';

const T = (n: number): string => `TASK-${HASH}-s1-t${n}`;
const ACTOR = { id: 'insrc:test', kind: 'agent' as const, properties: {} };

function anchorAll(repo: string): void {
	const dir = join(repo, ARTIFACTS_DIR);
	for (const name of readdirSync(dir).filter(n => n.endsWith('.json'))) {
		const p = join(dir, name);
		const doc = JSON.parse(readFileSync(p, 'utf8'));
		doc.meta.epicCreatedAt = CREATED;
		writeFileSync(p, JSON.stringify(doc, null, 2) + '\n');
	}
}
function groundPlan(path: string): void {
	const doc = JSON.parse(readFileSync(path, 'utf8'));
	for (const task of doc.body.tasks) task.derivedFrom = ['c1'];
	doc.citations = [{ id: 'c1', kind: 'prior-artifact', ref: 'LLD s1' }];
	writeFileSync(path, JSON.stringify(doc, null, 2) + '\n');
}

describe('sync-plan-tasks-denial.test.ts: through the real syncPlanTasks a denied close escapes as ToolDenied', () => {
	it('re-planning a Story whose plan drops t2: the denied close throws a TaskSyncDenied, the follow-on reports it, and the next call closes the issue', async () => {
		const fx = seed({ pushTasks: false, taskHeads: false });
		try {
			anchorAll(fx.repo); groundPlan(fx.plan);
			const t = fakeTracker();
			const ops = t.port.issueOps as unknown as Record<string, (...a: unknown[]) => unknown>;
			const closes: string[] = [];
			ops['close'] = (issue: unknown) => { closes.push(String(issue)); return { ok: true, value: undefined }; };
			_setAutoPushDepsForTests({ policy: teamPolicy, port: t.port as TrackerPort });
			_setTrackerExecForTests(() => '');

			// plan revision 1 is approved and its Task set made, each Task with an issue
			const first = await approveJson(fx.plan);
			const made = await followOnTasksSync([{ path: first.path, result: first }], fx.repo);
			assert.deepEqual([made[0]?.kind, made[0]?.ok], ['tasks-sync', true], JSON.stringify(made));
			assert.deepEqual(made[0]?.tasks?.created, ['t1', 't2']);
			const t2Issue = readBinding(fx.repo, T(2))?.reference.entityId;
			assert.match(t2Issue ?? '', /^acme\/demo#\d+$/);

			// the re-plan drops t2: revision 2 is approved
			const planId = planArtifactId(HASH, 's1');
			const doc = JSON.parse(readFileSync(fx.plan, 'utf8'));
			const lifecycle = createRepoLifecycle(fx.repo).service;
			await lifecycle.updateContent(planId, ACTOR, { body: { ...doc.body, tasks: [doc.body.tasks[0]] }, citations: doc.citations }, { addresses: [], outcome: { result: 'ok', summary: 're-plan: drop t2' } });
			const second = await approveJson(fx.plan);

			// the close is denied: the real syncPlanTasks throws the denial with what was done
			ops['close'] = () => { throw new ToolDenied('gh_issue_close', 'declined'); };
			await assert.rejects(syncPlanTasks(second.path), (e: unknown) => {
				assert.ok(e instanceof TaskSyncDenied);
				assert.equal(e.toolId, 'gh_issue_close');
				assert.deepEqual(e.partial.withdrawn, ['t2']);
				return true;
			});
			// the daemon follow-on turns it into a failed entry (with the partial arrays) and pushes nothing
			const outcomes = await followOnTasksSync([{ path: second.path, result: second }], fx.repo);
			assert.equal(outcomes.length, 1);
			assert.deepEqual([outcomes[0]?.kind, outcomes[0]?.ok], ['tasks-sync', false]);
			assert.match(outcomes[0]?.note ?? '', /gh_issue_close was denied \(declined\)/);
			assert.ok(outcomes[0]?.tasks !== undefined);

			// the next call (the user answers yes this time) closes the issue of the withdrawn Task, once
			ops['close'] = (issue: unknown) => { closes.push(String(issue)); return { ok: true, value: undefined }; };
			closes.length = 0;
			const again = await syncPlanTasks(second.path);
			assert.ok(!('error' in again), JSON.stringify(again));
			assert.deepEqual(closes, [t2Issue]);
			const none = closes.length;
			await syncPlanTasks(second.path);
			assert.equal(closes.length, none, 'a closed issue is not closed again');
		} finally { _setAutoPushDepsForTests(); _setTrackerExecForTests(); fx.cleanup(); }
	});

	it('a plan that cannot become Tasks is still the {error} result, never a denial', async () => {
		const fx = seed({ pushTasks: false, taskHeads: false });
		try {
			anchorAll(fx.repo); groundPlan(fx.plan);
			const doc = JSON.parse(readFileSync(fx.plan, 'utf8'));
			doc.body.tasks[1].order = 5;
			writeFileSync(fx.plan, JSON.stringify(doc, null, 2) + '\n');
			_setAutoPushDepsForTests({ policy: teamPolicy, port: fakeTracker().port as TrackerPort });
			const approved = await approveJson(fx.plan);
			const out = await syncPlanTasks(approved.path);
			assert.ok('error' in out && /order is not 1\.\.2/.test(out.error), JSON.stringify(out));
		} finally { _setAutoPushDepsForTests(); fx.cleanup(); }
	});
});
