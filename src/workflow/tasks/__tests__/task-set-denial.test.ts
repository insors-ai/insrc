/**
 * A denied close of a withdrawn Task's issue (Story s10): the reconciliation stops with a TaskSyncDenied that carries what was done,
 * the Task keeps a pending-close entry so the next reconciliation still closes the issue, and ordinary errors keep their {error} result.
 * Run: npx tsx --test-force-exit src/workflow/tasks/__tests__/task-set-denial.test.ts
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { History } from '../../artifact-core/history.js';
import { artifactJsonPath } from '../../storage.js';
import { bindArtifact } from '../../tracker/binding.js';
import { TaskSyncDenied, ToolDenied } from '../../tracker/tool-denied.js';
import type { CloseIssue } from '../task-set.js';
import { row } from './task-kit.js';
import { PLAN, alice, setKit, taskId, threeRows } from './task-set-kit.js';

const denying: CloseIssue = () => { throw new ToolDenied('gh_issue_close', 'declined'); };

/** The close entries of a Task's own log, oldest first. */
async function closeEntries(s: ReturnType<typeof setKit>, n: number): Promise<string[]> {
	const log = await new History(s.k.sidecar).log(taskId(n));
	return log.map(e => e.outcome?.result).filter((r): r is string => r === 'pending-close' || r === 'closed');
}

describe('task-set-denial.test.ts: syncOnPlanApproval rethrows ToolDenied with the partial arrays, ordinary errors keep {error}, and a pending-close entry lets the next reconciliation close the issue', () => {
	it('a denied close of a withdrawn Task throws a TaskSyncDenied with what was done, logs pending-close first, and the next call closes the issue and finishes the re-plan', async () => {
		const s = setKit();
		try {
			const path = artifactJsonPath(s.k.repo, PLAN);
			await s.plan(threeRows());
			await s.sets.createFromPlan(PLAN, alice);
			assert.ok(bindArtifact(s.k.repo, taskId(3), 'acme/demo#3').ok);
			// the re-plan: t1 reworded, t3 dropped, t9 new
			await s.plan([row('t1', 1, { summary: 'reworded' }), row('t2', 2), row('t9', 3, { dependsOn: ['t2'] })]);

			await assert.rejects(s.sets.syncOnPlanApproval(path, alice, { closeIssue: denying }), (e: unknown) => {
				assert.ok(e instanceof TaskSyncDenied, 'a TaskSyncDenied');
				assert.equal(e.toolId, 'gh_issue_close');
				assert.equal(e.reason, 'declined');
				assert.deepEqual(e.partial, { created: [], changed: ['t1'], withdrawn: ['t3'], added: [] });
				assert.deepEqual(e.detail.partial, e.partial);
				return true;
			});
			// the Task is withdrawn and keeps a pending-close entry (written before the denial was rethrown); the plan revision is not recorded
			assert.equal((await s.k.store.read(taskId(3))).lifecycle.status, 'withdrawn');
			assert.deepEqual(await closeEntries(s, 3), ['pending-close']);
			const log = await new History(s.k.sidecar).log(taskId(3));
			assert.match(log.at(-1)?.outcome?.summary ?? '', /acme\/demo#3 could not be closed: the call was denied \(declined\)/);

			// the next reconciliation closes the still-open issue (the withdrawn Task is not matched again, its pending close is) and finishes the re-plan
			const closed: string[] = [];
			const again = await s.sets.syncOnPlanApproval(path, alice, { closeIssue: issue => { closed.push(issue); return { ok: true }; } });
			assert.deepEqual(closed, ['acme/demo#3']);
			assert.ok(!('error' in again), JSON.stringify(again));
			assert.deepEqual('closeFailed' in again ? again.closeFailed : null, []);
			assert.deepEqual('added' in again ? again.added : null, ['t4'], 'the new Task is added now');
			assert.deepEqual(await closeEntries(s, 3), ['pending-close', 'closed']);
			// and a further call closes nothing again
			const n = closed.length;
			await s.sets.syncOnPlanApproval(path, alice, { closeIssue: issue => { closed.push(issue); return { ok: true }; } });
			assert.equal(closed.length, n);
		} finally { s.done(); }
	});

	it('a denial while a pending close is retried is rethrown too, and the Task stays pending', async () => {
		const s = setKit();
		try {
			const path = artifactJsonPath(s.k.repo, PLAN);
			await s.plan(threeRows());
			await s.sets.createFromPlan(PLAN, alice);
			assert.ok(bindArtifact(s.k.repo, taskId(3), 'acme/demo#3').ok);
			await s.plan([row('t1', 1), row('t2', 2)]);
			const first = await s.sets.syncOnPlanApproval(path, alice, { closeIssue: () => ({ ok: false, reason: 'offline' }) });
			assert.ok('closeFailed' in first && first.closeFailed.length === 1);
			await assert.rejects(s.sets.syncOnPlanApproval(path, alice, { closeIssue: denying }), (e: unknown) => e instanceof TaskSyncDenied);
			assert.deepEqual(await closeEntries(s, 3), ['pending-close', 'pending-close']);
			const closed: string[] = [];
			await s.sets.syncOnPlanApproval(path, alice, { closeIssue: issue => { closed.push(issue); return { ok: true }; } });
			assert.deepEqual(closed, ['acme/demo#3']);
		} finally { s.done(); }
	});

	it('an ordinary error keeps its {error} result, an async CloseIssue that fails the ordinary way is a closeFailed entry, and no denial is invented', async () => {
		const s = setKit();
		try {
			const path = artifactJsonPath(s.k.repo, PLAN);
			await s.plan(threeRows());
			await s.sets.createFromPlan(PLAN, alice);
			assert.ok(bindArtifact(s.k.repo, taskId(3), 'acme/demo#3').ok);
			await s.plan([row('t1', 1), row('t2', 2)]);
			const out = await s.sets.syncOnPlanApproval(path, alice, { closeIssue: () => { throw new Error('boom'); } });
			assert.deepEqual(out, { error: 'boom' });
			// the close that threw is kept pending, so the next call still closes the issue
			assert.deepEqual(await closeEntries(s, 3), ['pending-close']);
			const closed: string[] = [];
			const done = await s.sets.syncOnPlanApproval(path, alice, { closeIssue: async issue => { closed.push(issue); return { ok: true as const }; } });
			assert.ok(!('error' in done), JSON.stringify(done));
			assert.deepEqual(closed, ['acme/demo#3']);
			// an async CloseIssue that fails the ordinary way is a closeFailed entry
			const s2 = setKit();
			try {
				await s2.plan(threeRows());
				await s2.sets.createFromPlan(PLAN, alice);
				assert.ok(bindArtifact(s2.k.repo, taskId(3), 'acme/demo#3').ok);
				await s2.plan([row('t1', 1), row('t2', 2)]);
				const failed = await s2.sets.syncOnPlanApproval(artifactJsonPath(s2.k.repo, PLAN), alice, { closeIssue: async () => ({ ok: false as const, reason: 'offline' }) });
				assert.ok('closeFailed' in failed && failed.closeFailed[0]?.reason === 'offline');
			} finally { s2.done(); }
		} finally { s.done(); }
	});
});
