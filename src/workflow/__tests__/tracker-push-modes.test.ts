import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { autoPushEpicOnHld, autoPushStoryOnLld, autoPushTasksOnPlan } from '../tracker-auto.js';
import { defineArtifactId, lldArtifactId } from '../storage.js';
import { readBinding } from '../tracker/binding.js';
import type { TrackerPort } from '../tracker/port.js';
import type { PolicyReader } from '../team/types.js';
import { HASH, fakeTracker, nonePolicy, offPolicy, seed, teamPolicy, via } from './approve-fallback-kit.js';

const MODES: ReadonlyArray<readonly [string, PolicyReader]> = [['team', teamPolicy], ['individual (no policy)', nonePolicy], ['individual (teamMode off)', offPolicy]];
const CLAIM_METHODS = ['whoAmI', 'readAssignee', 'setAssignee', 'addAssignee'];

/** The fake tracker behind a proxy that notes any claim-related call, with its first sub-issue link failing. */
function watched(failFirstLink: boolean) {
	const t = fakeTracker();
	const touched: string[] = [];
	let failed = !failFirstLink;
	const ops = t.port.issueOps;
	const link = ops.linkSubIssue.bind(ops);
	(ops as { linkSubIssue: typeof ops.linkSubIssue }).linkSubIssue = (parent, childId) => {
		if (!failed) { failed = true; return { ok: false, kind: 'rejected', reason: 'link rejected' }; }
		return link(parent, childId);
	};
	const port = new Proxy(t.port, { get: (target, key: string) => { if (CLAIM_METHODS.includes(key)) touched.push(key); return (target as unknown as Record<string, unknown>)[key]; } }) as unknown as TrackerPort;
	return { t, port, touched };
}
const viaPort = (port: TrackerPort, policy: PolicyReader) => <T>(run: () => T): T => via({ port } as unknown as ReturnType<typeof fakeTracker>, policy)(run);

test('the three approve-time pushes run one path in team mode and in individual mode: each binds the Epic or Story, posts each comment once, retries a pending link, individual mode keeps its pushTasks policy and makes no claim, and a repository with no tracker has no binding', () => {
	for (const [mode, policy] of MODES) {
		const fx = seed({ pushTasks: false });
		try {
			const w = watched(true);
			const run = viaPort(w.port, policy);
			const epic = run(() => autoPushEpicOnHld(fx.hld));
			assert.equal(epic.status, 'created', mode);

			// the Story: its first link under the Epic fails, so it stays pending; the issue, the binding and the posts are made
			const story = run(() => autoPushStoryOnLld(fx.lld));
			assert.equal(story.status, 'created', mode);
			assert.equal(readBinding(fx.repo, `EPIC-${HASH}`)?.reference.entityId, 'acme/demo#1', `${mode}: the Epic is bound`);
			const binding = readBinding(fx.repo, `STORY-${HASH}-s1`);
			assert.equal(binding?.reference.entityId, 'acme/demo#2', `${mode}: the Story is bound`);
			assert.deepEqual(binding?.pendingLink && [binding.pendingLink.parent.entityId, binding.pendingLink.childId], ['acme/demo#1', 1002], `${mode}: the failed link is pending`);
			const posts = () => w.t.log.comments.filter(([ref]) => ref === 'acme/demo#2').length;
			assert.equal(posts(), 2, `${mode}: the design and review comments, once each`);
			assert.deepEqual(story.status === 'created' ? story.extrasFailed : undefined, undefined, `${mode}: no extra failed`);

			// the next approve retries the link and posts nothing again
			const again = run(() => autoPushStoryOnLld(fx.lld));
			assert.equal(again.status, 'already-exists', mode);
			assert.equal(readBinding(fx.repo, `STORY-${HASH}-s1`)?.pendingLink, undefined, `${mode}: the link was retried and cleared`);
			assert.equal(posts(), 2, `${mode}: nothing posted twice`);

			// the Task issues: team mode makes one per Task whatever pushTasks says; individual mode keeps the setting
			const tasks = run(() => autoPushTasksOnPlan(fx.plan));
			if (mode === 'team') {
				assert.equal(tasks.status, 'created', mode);
				assert.deepEqual(Object.keys(tasks.status === 'created' ? tasks.taskRefs ?? {} : {}).sort(), ['t1', 't2']);
			} else {
				assert.equal(tasks.status, 'skipped', `${mode}: pushTasks is off`);
				assert.equal(w.t.issues.length, 2, `${mode}: no Task issues`);
			}
			assert.deepEqual(w.touched, [], `${mode}: no claim was made`);
		} finally { fx.cleanup(); }
	}

	// individual mode with pushTasks on makes the Task issues, again with no claim
	const fx = seed({ pushTasks: true });
	try {
		const w = watched(false);
		const run = viaPort(w.port, nonePolicy);
		run(() => autoPushEpicOnHld(fx.hld)); run(() => autoPushStoryOnLld(fx.lld));
		const tasks = run(() => autoPushTasksOnPlan(fx.plan));
		assert.equal(tasks.status, 'created');
		assert.deepEqual(Object.keys(tasks.status === 'created' ? tasks.taskRefs ?? {} : {}).sort(), ['t1', 't2']);
		assert.deepEqual(w.touched, []);
	} finally { fx.cleanup(); }

	// a repository with no tracker is skipped before anything is looked up or created, and has no binding
	for (const [mode, policy] of MODES) {
		const none = seed({ pushTasks: true });
		try {
			writeFileSync(join(none.repo, 'github.json'), JSON.stringify({ repos: { [none.repo]: { type: 'none' } } }));
			const w = watched(false);
			const run = viaPort(w.port, policy);
			const results = [run(() => autoPushEpicOnHld(none.hld)), run(() => autoPushStoryOnLld(none.lld)), run(() => autoPushTasksOnPlan(none.plan))];
			assert.deepEqual(results.map(r => r.status), ['skipped', 'skipped', 'skipped'], mode);
			assert.equal(w.t.log.creates, 0, mode);
			assert.equal(readBinding(none.repo, defineArtifactId(HASH)), undefined, `${mode}: no binding`);
			assert.equal(readBinding(none.repo, lldArtifactId(HASH, 's1')), undefined);
			assert.equal((JSON.parse(readFileSync(none.hld, 'utf8')) as { meta: { envelope?: unknown } }).meta.envelope, undefined);
		} finally { none.cleanup(); }
	}
});
