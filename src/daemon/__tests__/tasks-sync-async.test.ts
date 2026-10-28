/**
 * The close of a dropped Task's issue through an async tracker port (Story s10): ok closes it, a gh failure is a closeFailed entry
 * that the next call retries, exactly as with a synchronous port.
 * Run: npx tsx --test-force-exit src/daemon/__tests__/tasks-sync-async.test.ts
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
import { _setTrackerExecForTests } from '../../workflow/tracker/__tests__/_legacy-table.js';
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

type CloseAnswer = { ok: true; value: undefined } | { ok: false; kind: string; reason: string };

describe('tasks-sync-async.test.ts: a withdrawn-Task close through an async CloseIssue reports ok and gh failure as before', () => {
	for (const asyncPort of [false, true]) {
		it(`${asyncPort ? 'async' : 'sync'} port: a dropped Task's issue is closed once; a gh failure is a closeFailed entry and the next call closes it`, async () => {
			const fx = seed({ pushTasks: false, taskHeads: false });
			try {
				anchorAll(fx.repo);
				const doc0 = JSON.parse(readFileSync(fx.plan, 'utf8'));
				for (const task of doc0.body.tasks) task.derivedFrom = ['c1'];
				doc0.citations = [{ id: 'c1', kind: 'prior-artifact', ref: 'LLD s1' }];
				writeFileSync(fx.plan, JSON.stringify(doc0, null, 2) + '\n');

				const t = fakeTracker();
				const ops = t.port.issueOps as unknown as Record<string, (...a: unknown[]) => unknown>;
				const closes: string[] = [];
				let answer: CloseAnswer = { ok: true, value: undefined };
				ops['close'] = (issue: unknown) => {
					closes.push(String(issue));
					return asyncPort ? new Promise(r => setImmediate(() => r(answer))) : answer;
				};
				_setAutoPushDepsForTests({ policy: teamPolicy, port: t.port as TrackerPort });
				_setTrackerExecForTests(() => '');

				const first = await approveJson(fx.plan);
				await followOnTasksSync([{ path: first.path, result: first }], fx.repo);
				const t2Issue = readBinding(fx.repo, T(2))?.reference.entityId;

				const doc = JSON.parse(readFileSync(fx.plan, 'utf8'));
				await createRepoLifecycle(fx.repo).service.updateContent(planArtifactId(HASH, 's1'), ACTOR, { body: { ...doc.body, tasks: [doc.body.tasks[0]] }, citations: doc.citations }, { addresses: [], outcome: { result: 'ok', summary: 're-plan: drop t2' } });
				const second = await approveJson(fx.plan);

				// a gh failure: reported, not thrown; the Task is withdrawn and the close is kept pending
				answer = { ok: false, kind: 'unreachable', reason: 'gh timed out after 10 s' };
				const failed = await syncPlanTasks(second.path);
				assert.ok('closeFailed' in failed, JSON.stringify(failed));
				assert.deepEqual(failed.closeFailed, [{ taskId: 't2', issue: t2Issue, reason: 'gh timed out after 10 s' }]);
				// back online: the retry closes it, and a further call closes nothing
				answer = { ok: true, value: undefined };
				closes.length = 0;
				const done = await syncPlanTasks(second.path);
				assert.ok('closeFailed' in done && done.closeFailed.length === 0, JSON.stringify(done));
				assert.deepEqual(closes, [t2Issue]);
				await syncPlanTasks(second.path);
				assert.deepEqual(closes, [t2Issue], 'a closed issue is not closed again');
			} finally { _setAutoPushDepsForTests(); _setTrackerExecForTests(); fx.cleanup(); }
		});
	}
});
