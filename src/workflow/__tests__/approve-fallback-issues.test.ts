/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * The approve-time pushes (the terminal approve fallback) in team mode and in
 * individual mode (no policy, or teamMode false). Both adopt the issues the draft hook made, create the rest, bind
 * each unit and run each extra once; team mode forces Task issues, individual mode keeps the pushTasks setting.
 *
 * Run: npx tsx --test src/workflow/__tests__/approve-fallback-issues.test.ts
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { _setAutoPushDepsForTests, autoPushEpicOnHld, autoPushStoryOnLld, autoPushTasksOnPlan } from '../tracker-auto.js';
import { artifactJsonPath, defineArtifactId, hldArtifactId, lldArtifactId, planArtifactId } from '../storage.js';
import { _setTrackerExecForTests, type TrackerExec } from '../tracker/github.js';
import { titleMatchesToken, type CreatedIssue, type IssueRef, type IssueSpec, type PortResult, type TrackerPort } from '../tracker/port.js';
import { ensureUnitIssueDetailed } from '../tracker/unit-issue.js';
import type { PolicyReader, TeamPolicy } from '../team/types.js';

import { HASH, SLUG, CREATED, OK, TEAM, teamPolicy, offPolicy, nonePolicy, brokenPolicy, fakeTracker, seed, trackerOf, via, type Fx } from './approve-fallback-kit.js';

// ---------------------------------------------------------------------------

test('in team mode the three pushes adopt, force Task issues, fail on lookup or unreadable policy, and run extras once', async () => {
	const fx = seed({ pushTasks: false });
	try {
		const t = fakeTracker();
		// the draft hook already made the Epic and the Story issue
		const e0 = await ensureUnitIssueDetailed({ unit: 'epic', repoPath: fx.repo, epicHash: HASH }, t.port); assert.equal(e0.ok, true, JSON.stringify(e0));
		assert.equal((await ensureUnitIssueDetailed({ unit: 'story', repoPath: fx.repo, epicHash: HASH, storyId: 's1' }, t.port)).ok, true);
		assert.equal(t.log.creates, 2);

		// Epic approve: adopts, posts the HLD summary and the review once
		const epic = await via(t)(async () => await autoPushEpicOnHld(fx.hld));
		assert.deepEqual(epic, { status: 'already-exists', epicRef: 'acme/demo#1' });
		assert.equal(t.log.creates, 2, 'no second Epic issue');

		// Story approve: the task-list splice, the design comment and the review comment run once and are marked
		const story = await via(t)(async () => await autoPushStoryOnLld(fx.lld));
		assert.deepEqual(story, { status: 'already-exists', storyRef: 'acme/demo#2' });
		const storyPosts = t.log.comments.filter(([ref]) => ref === 'acme/demo#2').length;
		assert.equal(storyPosts, 2, 'design comment and review comment');
		assert.equal(t.log.writeBodies, 1, 'the Epic task list was spliced');
		const before = { comments: t.log.comments.length, writes: t.log.writeBodies };
		assert.equal((await via(t)(async () => await autoPushStoryOnLld(fx.lld))).status, 'already-exists');
		assert.equal((await via(t)(async () => await autoPushEpicOnHld(fx.hld))).status, 'already-exists');
		assert.deepEqual({ comments: t.log.comments.length, writes: t.log.writeBodies }, before, 'a second approve posts nothing');
		assert.deepEqual((JSON.parse(readFileSync(artifactJsonPath(fx.repo, `STORY-${HASH}-s1`), 'utf8')).meta.envelope.binding.posted as Array<{ kind: string }>).map(p => p.kind).sort(), ['design', 'review', 'task-list'], 'the binding records what was posted');

		// the draft hook also made both Task issues: the plan approve adopts them and creates none
		for (const taskId of ['t1', 't2']) {
			assert.equal((await ensureUnitIssueDetailed({ unit: 'task', repoPath: fx.repo, epicHash: HASH, storyId: 's1', taskId }, t.port)).ok, true);
		}
		assert.equal(t.log.creates, 4);
		assert.deepEqual(await via(t)(async () => await autoPushTasksOnPlan(fx.plan)), { status: 'already-exists', taskRefs: { t1: 'acme/demo#3', t2: 'acme/demo#4' } });
		assert.equal(t.log.creates, 4, 'no second Task issue');
	} finally { fx.cleanup(); }

	// pushTasks off: the plan approve still creates a Task issue per Task, in plan order, and a second one creates none
	const forced = seed({ pushTasks: false });
	try {
		const t = fakeTracker();
		assert.deepEqual(await via(t)(async () => await autoPushTasksOnPlan(forced.plan)), { status: 'created', taskRefs: { t1: 'acme/demo#3', t2: 'acme/demo#4' } });
		assert.equal((await via(t)(async () => await autoPushTasksOnPlan(forced.plan))).status, 'already-exists');
		assert.equal(t.log.creates, 4, 'the Epic, the Story and the two Tasks');
	} finally { forced.cleanup(); }

	// a failed Epic lookup is a failure and creates nothing
	const lost = seed();
	try {
		const t = fakeTracker({ failFind: true });
		const r = await via(t)(async () => await autoPushEpicOnHld(lost.hld));
		assert.equal(r.status, 'failed');
		assert.equal(t.log.creates, 0);
	} finally { lost.cleanup(); }

	// an unreadable policy makes all three return failed, with the reason
	const bad = seed();
	try {
		const t = fakeTracker();
		for (const r of [await via(t, brokenPolicy)(async () => await autoPushEpicOnHld(bad.hld)), await via(t, brokenPolicy)(async () => await autoPushStoryOnLld(bad.lld)), await via(t, brokenPolicy)(async () => await autoPushTasksOnPlan(bad.plan))]) {
			assert.equal(r.status, 'failed');
			assert.match(r.status === 'failed' ? r.reason : '', /cannot be read/);
		}
		assert.equal(t.log.creates, 0);
	} finally { bad.cleanup(); }

	// one failing extra is reported, keeps the others marked, and only it is retried
	const part = seed();
	try {
		const t = fakeTracker({ failComment: '## LLD' });
		await via(t)(async () => await autoPushEpicOnHld(part.hld));
		const first = await via(t)(async () => await autoPushStoryOnLld(part.lld));
		assert.deepEqual(first.status === 'created' ? first.extrasFailed?.map(f => f.name) : null, ['designComment']);
		const healed = fakeTracker();
		healed.issues.push(...t.issues);
		const second = await via(healed)(async () => await autoPushStoryOnLld(part.lld));
		assert.equal(second.status, 'already-exists');
		assert.deepEqual(healed.log.comments.map(([, b]) => b.split('\n').slice(0, 2)), [[`<!-- insrc:post:STORY-${HASH}-s1:design -->`, '## LLD — Story s1']], 'the comment carries its post marker first');
		assert.equal(healed.log.writeBodies, 0, 'the marked task-list splice is not repeated');
	} finally { part.cleanup(); }
});

test('with no policy, or teamMode off, the three pushes run the individual-mode path: one gh sequence, no per-unit record for an Epic or a Story, and a Task push skipped when pushTasks is off', async () => {
	const run = async (policy: PolicyReader | undefined) => {
		const calls: string[][] = [];
		let n = 0;
		const exec: TrackerExec = (cmd, args) => {
			calls.push([cmd, ...args]);
			if (cmd === 'git') return 'git@github.com:acme/demo.git\n';
			if (args[0] === 'api' && args.includes('POST') && (args.find(a => a.startsWith('repos/')) ?? '').endsWith('/issues')) { n += 1; return JSON.stringify({ number: n, id: 1000 + n }); }
			if (args[0] === 'issue' && args[1] === 'view') return args.includes('body') ? 'epic body' : '{}';
			return '';
		};
		_setTrackerExecForTests(exec);
		const fx = seed({ pushTasks: false });
		try {
			_setAutoPushDepsForTests(policy === undefined ? {} : { policy });
			const results = [await autoPushEpicOnHld(fx.hld), await autoPushStoryOnLld(fx.lld), await autoPushTasksOnPlan(fx.plan)];
			const masked = calls.map(c => c.map(a => a.replace(fx.repo, '<repo>')).join(' '));
			return { results, masked, hld: trackerOf(fx.hld), lld: trackerOf(fx.lld) };
		} finally { fx.cleanup(); }
	};
	const baseline = await run(undefined);
	for (const policy of [nonePolicy, offPolicy]) {
		const r = await run(policy);
		assert.deepEqual(r.masked, baseline.masked, 'the same gh command sequence');
		assert.deepEqual(r.results.map(x => x.status), ['created', 'created', 'skipped'], 'pushTasks off still returns skipped');
		assert.deepEqual(r.results, baseline.results);
		for (const block of [r.hld, r.lld]) assert.equal('units' in block, false, 'no per-unit record: an Epic and a Story are bound on their artifacts');
	}
});
