/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Integration tests for `autoPushTasksOnPlan` — the plan-approve → Task
 * issue push (native issue type `Task`, sub-issues of the Story). Driven
 * against a FAKE `gh` (injected via _setTrackerExecForTests): the Task
 * issues are created via `gh api POST .../issues` (returning {number,id})
 * and linked via `gh api POST .../issues/{n}/sub_issues`.
 *
 * Covers: opt-out by default, typed create + sub-issue link, untyped
 * fallback when the org lacks the issue type, dedup on re-push, and the
 * "Story not pushed yet" guard.
 *
 * Run: npx tsx --test src/workflow/__tests__/tracker-tasks.test.ts
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

import { autoPushEpicOnHld, autoPushStoryOnLld, autoPushTasksOnPlan } from '../tracker-auto.js';
import { _setTrackerExecForTests, type TrackerExec } from '../tracker/github.js';
import { planArtifactPaths } from '../storage.js';

const HASH = 'a1b2c3d4e5f60718';
const SLUG = 'demo-feature';

// ---------------------------------------------------------------------------
// Fake gh/git — handles `gh issue create` (URL) AND `gh api` issue-create
// (JSON {number,id}) + sub_issues.
// ---------------------------------------------------------------------------

interface FakeOpts { readonly failOnType?: boolean }

function makeFakeGh(opts: FakeOpts = {}) {
	let counter = 0;
	const calls: string[][] = [];
	const fn: TrackerExec = (cmd, args) => {
		calls.push([cmd, ...args]);
		if (cmd === 'git') return 'git@github.com:acme/demo.git\n';
		const [sub0, sub1] = args;
		if (sub0 === 'auth' || sub0 === 'label') return '';
		if (sub0 === 'issue') {
			if (sub1 === 'create') { counter += 1; return `https://github.com/acme/demo/issues/${counter}\n`; }
			if (sub1 === 'list') return '';
			if (sub1 === 'view') return args.includes('body') ? '' : JSON.stringify({ state: 'OPEN', labels: [] });
			return '';
		}
		if (sub0 === 'api') {
			const path = args.find(a => a.startsWith('repos/')) ?? '';
			if (path.endsWith('/sub_issues')) return '';               // sub-issue link ok
			if (path.endsWith('/issues')) {                             // issue create via api
				const hasType = args.some(a => a.startsWith('type='));
				if (hasType && opts.failOnType === true) throw new Error('422 issue type not enabled');
				counter += 1;
				return JSON.stringify({ number: counter, id: 1000 + counter });
			}
			return '';                                                  // milestones etc.
		}
		return '';
	};
	return { fn, calls, createCount: () => counter };
}

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function writeJson(path: string, obj: unknown): void {
	mkdirSync(dirname(path), { recursive: true });
	writeFileSync(path, JSON.stringify(obj, null, 2) + '\n');
}

function setup(pushTasks: boolean): { repo: string; hldJson: string; lldJson: string; planJson: string; cleanup: () => void } {
	const repo = mkdtempSync(join(tmpdir(), 'insrc-tracker-tasks-'));
	mkdirSync(join(repo, 'docs/defines'), { recursive: true });
	mkdirSync(join(repo, 'docs/designs'), { recursive: true });
	mkdirSync(join(repo, 'docs/plans'), { recursive: true });
	const ghCfg = join(repo, 'github.json');
	writeFileSync(ghCfg, JSON.stringify({ default: { type: 'github', ...(pushTasks ? { pushTasks: true } : {}) } }));
	process.env['INSRC_GITHUB_CONFIG'] = ghCfg;

	const defineJson = join(repo, '.insrc/artifacts', `DEF-${HASH}.json`);
	writeJson(defineJson, {
		meta: { workflow: 'define', runId: 'd1', repoPath: repo, epicHash: HASH, epicSlug: SLUG, createdAt: '', schemaVersion: 1 },
		body: {
			flavor: 'new-capability', problem: 'Users cannot filter. This blocks onboarding.',
			nonGoals: [], assumptions: [], constraints: [],
			stories: [{ id: 's1', title: 'Add filter field', userValue: 'v', acceptanceCriteria: [], sizeEstimate: 'S' }],
			openQuestions: [],
		},
		citations: [],
	});
	const hldJson = join(repo, '.insrc/artifacts', `HLD-${HASH}.json`);
	writeJson(hldJson, { meta: { workflow: 'design.epic', runId: 'h1', repoPath: repo, epicHash: HASH, epicSlug: SLUG, schemaVersion: 1 }, body: {} });
	const lldJson = join(repo, '.insrc/artifacts', `LLD-${HASH}-s1.json`);
	writeJson(lldJson, { meta: { workflow: 'design.story', runId: 'l1', repoPath: repo, epicHash: HASH, epicSlug: SLUG, storyId: 's1', hldBaseRunId: 'h1', hldEffectiveHash: 'deadbeefcafe', hldAmendmentsApplied: [], schemaVersion: 1 }, body: {} });

	const planJson = planArtifactPaths(repo, HASH, 's1').json;
	writeJson(planJson, {
		meta: { workflow: 'plan', runId: 'p1', repoPath: repo, epicHash: HASH, epicSlug: SLUG, storyId: 's1', lldRunId: 'l1', lldEffectiveHash: 'deadbeefcafe', schemaVersion: 1 },
		body: {
			tasks: [
				{ id: 't1', title: 'Add filter input', summary: 'Wire the input.', size: 'S', order: 1, dependsOn: [], acceptanceChecks: ['renders'], derivedFrom: ['c1'], tests: [{ level: 'unit', name: 'unit: input renders' }] },
				{ id: 't2', title: 'Filter the list', summary: 'Apply the predicate.', size: 'M', order: 2, dependsOn: ['t1'], acceptanceChecks: ['filters'], derivedFrom: ['c1'], tests: [{ level: 'unit', name: 'unit: list filters' }] },
			],
			testStrategyCoverage: [{ lldStrategyItem: 'unit: input renders', coveredByTaskIds: ['t1'] }],
		},
		citations: [{ id: 'c1', kind: 'prior-artifact', ref: 'LLD s1' }],
	});

	return { repo, hldJson, lldJson, planJson, cleanup: () => { delete process.env['INSRC_GITHUB_CONFIG']; _setTrackerExecForTests(); rmSync(repo, { recursive: true, force: true }); } };
}

function trackerOf(jsonPath: string): Record<string, unknown> {
	return (JSON.parse(readFileSync(jsonPath, 'utf8')) as { meta: { tracker?: Record<string, unknown> } }).meta.tracker ?? {};
}

/** Push the Epic + Story first so a storyRef exists for the tasks. */
function pushEpicAndStory(hldJson: string, lldJson: string): void {
	autoPushEpicOnHld(hldJson);
	autoPushStoryOnLld(lldJson);
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

test('task push is opt-out by default (pushTasks unset) → skipped, no issues', () => {
	const gh = makeFakeGh();
	_setTrackerExecForTests(gh.fn);
	const s = setup(/* pushTasks */ false);
	try {
		pushEpicAndStory(s.hldJson, s.lldJson);
		const before = gh.createCount();
		const r = autoPushTasksOnPlan(s.planJson);
		assert.equal(r.status, 'skipped');
		assert.equal(r.status === 'skipped' && /pushTasks/.test(r.reason), true);
		assert.equal(gh.createCount(), before);                 // no task issues created
	} finally { s.cleanup(); }
});

test('pushTasks: creates a typed Task issue per PlanTask, linked as a sub-issue', () => {
	const gh = makeFakeGh();
	_setTrackerExecForTests(gh.fn);
	const s = setup(/* pushTasks */ true);
	try {
		pushEpicAndStory(s.hldJson, s.lldJson);       // epic #1, story #2
		const r = autoPushTasksOnPlan(s.planJson);
		assert.equal(r.status, 'created', JSON.stringify(r));
		// Two Task issues (#3, #4) recorded on the plan meta.
		assert.deepEqual(trackerOf(s.planJson)['taskRefs'], { t1: 'acme/demo#3', t2: 'acme/demo#4' });

		// Each create went through `gh api POST .../issues` with `type=Task`.
		// Task creates only (the Story now also POSTs a REST issue — exclude it by its label).
		const apiCreates = gh.calls.filter(c => c[0] === 'gh' && c[1] === 'api' && c.some(a => a === 'repos/acme/demo/issues') && c.some(a => a === 'labels[]=insrc:task'));
		assert.equal(apiCreates.length, 2);
		assert.ok(apiCreates.every(c => c.some(a => a === 'type=Task')), 'issue create missing type=Task');

		// Each Task was linked as a sub-issue of the Story (#2) with its db id.
		const subLinks = gh.calls.filter(c => c[0] === 'gh' && c[1] === 'api' && c.some(a => a === 'repos/acme/demo/issues/2/sub_issues'));
		assert.equal(subLinks.length, 2);
		assert.ok(subLinks.some(c => c.includes('sub_issue_id=1003')), 'sub_issue_id for t1 not linked');
		assert.ok(subLinks.some(c => c.includes('sub_issue_id=1004')), 'sub_issue_id for t2 not linked');
	} finally { s.cleanup(); }
});

test('pushTasks: falls back to an untyped issue when the org lacks the issue type', () => {
	const gh = makeFakeGh({ failOnType: true });
	_setTrackerExecForTests(gh.fn);
	const s = setup(true);
	try {
		pushEpicAndStory(s.hldJson, s.lldJson);
		const r = autoPushTasksOnPlan(s.planJson);
		assert.equal(r.status, 'created', JSON.stringify(r));
		// Both tasks still created (untyped) + recorded.
		assert.deepEqual(trackerOf(s.planJson)['taskRefs'], { t1: 'acme/demo#3', t2: 'acme/demo#4' });
		// The typed attempt was retried without `type=` (a bare create call exists).
		const bareCreates = gh.calls.filter(c => c[1] === 'api' && c.some(a => a === 'repos/acme/demo/issues') && !c.some(a => a.startsWith('type=')) && c.some(a => a === 'labels[]=insrc:task'));
		assert.equal(bareCreates.length, 2);
	} finally { s.cleanup(); }
});

test('pushTasks: re-push is idempotent (adopts taskRefs, no new issues)', () => {
	const gh = makeFakeGh();
	_setTrackerExecForTests(gh.fn);
	const s = setup(true);
	try {
		pushEpicAndStory(s.hldJson, s.lldJson);
		autoPushTasksOnPlan(s.planJson);
		const after1 = gh.createCount();
		const r = autoPushTasksOnPlan(s.planJson);
		assert.equal(r.status, 'already-exists');
		assert.equal(gh.createCount(), after1);                 // no new creates
	} finally { s.cleanup(); }
});

test('pushTasks: skips when the Story issue does not exist yet', () => {
	const gh = makeFakeGh();
	_setTrackerExecForTests(gh.fn);
	const s = setup(true);
	try {
		// No epic/story push → no storyRef.
		const r = autoPushTasksOnPlan(s.planJson);
		assert.equal(r.status, 'skipped');
		assert.equal(r.status === 'skipped' && /Story not pushed/.test(r.reason), true);
		assert.equal(gh.createCount(), 0);
	} finally { s.cleanup(); }
});
