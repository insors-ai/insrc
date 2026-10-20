/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Integration tests for the deterministic approve-time tracker push,
 * driven against a FAKE `gh`/`git` (injected via _setTrackerExecForTests)
 * so no network/real repo is needed.
 *
 * Covers: Epic + Story creation, nested `meta.tracker` writes, doc→issue
 * linkage (the `.md` gets a `**Tracker:**` line), slug-based doc links in
 * the issue body, the duplicate-adopt guard, and idempotence.
 *
 * Run: npx tsx --test src/workflow/__tests__/tracker-auto.test.ts
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

import { autoPushEpicOnHld, autoPushStoryOnLld, autoPushTasksOnPlan } from '../tracker-auto.js';
import { planArtifactPaths } from '../storage.js';
import { _setTrackerExecForTests, type TrackerExec } from '../tracker/github.js';

const HASH = 'a1b2c3d4e5f60718';
const SLUG = 'demo-feature';
const CREATED = '2026-07-17T07:42:28.275Z';   // → E20260717a1b2c3d4
const EPIC_SEGMENT = 'E20260717a1b2c3d4';
const EPIC_FOLDER = `docs/epics/${SLUG}-${EPIC_SEGMENT}`;

// ---------------------------------------------------------------------------
// Fake gh/git
// ---------------------------------------------------------------------------

function makeFakeGh() {
	let counter = 0;
	let findResult = '';                          // dup-guard: '' = none, '<n>' = adopt
	const bodies = new Map<string, string>();
	const calls: string[][] = [];
	const fn: TrackerExec = (cmd, args) => {
		calls.push([cmd, ...args]);
		if (cmd === 'git') return 'git@github.com:acme/demo.git\n';
		const [sub0, sub1] = args;
		if (sub0 === 'auth' || sub0 === 'label') return '';
		if (sub0 === 'api') {
			const pi = args.indexOf('POST');
			const path = pi >= 0 ? String(args[pi + 1] ?? '') : '';
			if (path.endsWith('/sub_issues')) return '';                 // native sub-issue link — ok
			if (path.endsWith('/issues')) {                              // issue create via REST (story now)
				counter += 1;
				const bodyArg = args.find(a => String(a).startsWith('body='));
				if (bodyArg !== undefined) bodies.set(String(counter), String(bodyArg).slice('body='.length));
				return JSON.stringify({ number: counter, id: 1000 + counter });
			}
			return '';
		}
		if (sub0 === 'issue') {
			if (sub1 === 'create') {
				counter += 1;
				const bi = args.indexOf('--body');
				bodies.set(String(counter), bi >= 0 ? String(args[bi + 1]) : '');
				return `https://github.com/acme/demo/issues/${counter}\n`;
			}
			if (sub1 === 'list') return findResult;
			if (sub1 === 'view') return args.includes('body') ? (bodies.get(String(args[2])) ?? '') : JSON.stringify({ state: 'OPEN', labels: [] });
			if (sub1 === 'edit') { const bi = args.indexOf('--body'); if (bi >= 0) bodies.set(String(args[2]), String(args[bi + 1])); return ''; }
			if (sub1 === 'comment') return '';
		}
		return '';
	};
	return { fn, calls, bodies, setFind: (r: string) => { findResult = r; }, createCount: () => counter };
}

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function writeJson(path: string, obj: unknown): void {
	mkdirSync(dirname(path), { recursive: true });
	writeFileSync(path, JSON.stringify(obj, null, 2) + '\n');
}

/** tmp repo with a github.json (type: github → git-remote fallback) and
 *  the Define/HLD/LLD artifact JSONs. */
function setup(): { repo: string; hldJson: string; lldJson: string; defineJson: string; cleanup: () => void } {
	const repo = mkdtempSync(join(tmpdir(), 'insrc-tracker-'));
	mkdirSync(join(repo, 'docs/defines'), { recursive: true });
	mkdirSync(join(repo, 'docs/designs'), { recursive: true });
	const ghCfg = join(repo, 'github.json');
	writeFileSync(ghCfg, JSON.stringify({ default: { type: 'github' } }));
	process.env['INSRC_GITHUB_CONFIG'] = ghCfg;

	const defineJson = join(repo, '.insrc/artifacts', `DEF-${HASH}.json`);
	writeJson(defineJson, {
		meta: { workflow: 'define', runId: 'd1', repoPath: repo, focus: 'demo', epicHash: HASH, epicSlug: SLUG, createdAt: CREATED, schemaVersion: 1 },
		body: {
			flavor: 'new-capability',
			problem: 'Users cannot filter results. This blocks onboarding.',
			nonGoals: [], assumptions: [],
			constraints: [{ id: 'c1', text: 'Respect auth', type: 'invariant', source: 'c-01' }],
			stories: [{ id: 's1', title: 'Add filter field', userValue: 'type a filter', acceptanceCriteria: [], sizeEstimate: 'S' }],
			openQuestions: [],
		},
		citations: [],
	});
	const hldJson = join(repo, '.insrc/artifacts', `HLD-${HASH}.json`);
	writeJson(hldJson, { meta: { workflow: 'design.epic', runId: 'h1', repoPath: repo, epicHash: HASH, epicSlug: SLUG, schemaVersion: 1 }, body: {} });
	const lldJson = join(repo, '.insrc/artifacts', `LLD-${HASH}-s1.json`);
	writeJson(lldJson, { meta: { workflow: 'design.story', runId: 'l1', repoPath: repo, epicHash: HASH, epicSlug: SLUG, storyId: 's1', hldBaseRunId: 'h1', hldEffectiveHash: 'deadbeefcafe', hldAmendmentsApplied: [], schemaVersion: 1 }, body: {} });

	return { repo, hldJson, lldJson, defineJson, cleanup: () => { delete process.env['INSRC_GITHUB_CONFIG']; _setTrackerExecForTests(); rmSync(repo, { recursive: true, force: true }); } };
}

function trackerOf(jsonPath: string): Record<string, unknown> {
	return (JSON.parse(readFileSync(jsonPath, 'utf8')) as { meta: { tracker?: Record<string, unknown> } }).meta.tracker ?? {};
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

test('HLD approve creates the Epic issue, links docs, and writes nested meta.tracker', () => {
	const gh = makeFakeGh();
	_setTrackerExecForTests(gh.fn);
	const s = setup();
	try {
		const r = autoPushEpicOnHld(s.hldJson);
		assert.equal(r.status, 'created');
		assert.equal(r.status === 'created' ? r.epicRef : '', 'acme/demo#1');

		// nested meta.tracker on BOTH the HLD and the Define (aggregate).
		assert.equal(trackerOf(s.hldJson)['epicRef'], 'acme/demo#1');
		assert.equal(trackerOf(s.defineJson)['epicRef'], 'acme/demo#1');

		// doc → issue: the Define markdown gained a Tracker link.
		const defineMd = readFileSync(join(s.repo, EPIC_FOLDER, 'DEF.md'), 'utf8');
		assert.match(defineMd, /\*\*Tracker:\*\* \[acme\/demo#1\]/);

		// issue body carries nested slug-based doc links (not the flat hash path).
		const epicBody = gh.bodies.get('1') ?? '';
		assert.match(epicBody, new RegExp(`${EPIC_FOLDER}/HLD\\.md`));
		assert.doesNotMatch(epicBody, /HLD-a1b2c3d4e5f60718\.md/);
	} finally { s.cleanup(); }
});

test('LLD approve creates the Story issue + aggregates into the Define; links the LLD doc', () => {
	const gh = makeFakeGh();
	_setTrackerExecForTests(gh.fn);
	const s = setup();
	try {
		autoPushEpicOnHld(s.hldJson);           // epic first (LLD needs the epicRef)
		const r = autoPushStoryOnLld(s.lldJson);
		assert.equal(r.status, 'created');
		assert.equal(r.status === 'created' ? r.storyRef : '', 'acme/demo#2');

		assert.equal(trackerOf(s.lldJson)['storyRef'], 'acme/demo#2');
		assert.deepEqual(trackerOf(s.defineJson)['storyRefs'], { s1: 'acme/demo#2' });
	} finally { s.cleanup(); }
});

test('re-approving the HLD is idempotent (no second issue)', () => {
	const gh = makeFakeGh();
	_setTrackerExecForTests(gh.fn);
	const s = setup();
	try {
		autoPushEpicOnHld(s.hldJson);
		const before = gh.createCount();
		const r = autoPushEpicOnHld(s.hldJson);
		assert.equal(r.status, 'already-exists');
		assert.equal(gh.createCount(), before);   // no new create
	} finally { s.cleanup(); }
});

test('duplicate guard adopts an existing Epic issue instead of creating one', () => {
	const gh = makeFakeGh();
	gh.setFind('9');                             // an epic issue already exists
	_setTrackerExecForTests(gh.fn);
	const s = setup();
	try {
		const r = autoPushEpicOnHld(s.hldJson);
		assert.equal(r.status, 'already-exists');
		assert.equal(r.status === 'already-exists' ? r.epicRef : '', 'acme/demo#9');
		assert.equal(gh.createCount(), 0);       // adopted, not created
		assert.equal(trackerOf(s.hldJson)['epicRef'], 'acme/demo#9');
	} finally { s.cleanup(); }
});

test('tracker disabled (no config) skips cleanly', () => {
	const gh = makeFakeGh();
	_setTrackerExecForTests(gh.fn);
	const s = setup();
	// Point at a path that does not exist → the loader returns {} → type: none.
	// (Deleting the env var would fall back to the user's real ~/.insrc/github.json,
	// making the test non-hermetic — it fails whenever a real tracker is configured.)
	process.env['INSRC_GITHUB_CONFIG'] = join(s.repo, 'no-such-github.json');
	try {
		const r = autoPushEpicOnHld(s.hldJson);
		assert.equal(r.status, 'skipped');
	} finally { s.cleanup(); }
});

test('missing required meta fields skip', () => {
	const gh = makeFakeGh();
	_setTrackerExecForTests(gh.fn);
	const s = setup();
	try {
		writeJson(s.hldJson, { meta: { workflow: 'design.epic', runId: 'h1', repoPath: s.repo }, body: {} });
		const r = autoPushEpicOnHld(s.hldJson);
		assert.equal(r.status, 'skipped');
		assert.equal(r.status === 'skipped' && /missing epicHash/.test(r.reason), true);
	} finally { s.cleanup(); }
});

test('R4: posts the review report as an issue comment when the artifact carries meta.review', () => {
	const s = setup();
	const gh = makeFakeGh();
	_setTrackerExecForTests(gh.fn);
	try {
		const hld = JSON.parse(readFileSync(s.hldJson, 'utf8')) as { meta: Record<string, unknown> };
		hld.meta['review'] = {
			artifact: 'HLD', stage: 'design.epic', verdict: 'block',
			findings: [{ claimId: 'c1', kind: 'inventory', severity: 'HIGH', premise: 'p', evidence: 'e', action: 'a', fixability: 'manual' }],
			counts: { high: 1, med: 0, low: 0 }, reviewedAt: '2026-07-21T00:00:00.000Z', model: 'm',
		};
		writeFileSync(s.hldJson, JSON.stringify(hld, null, 2));
		autoPushEpicOnHld(s.hldJson);
		const reviewComment = gh.calls
			.filter(c => c[1] === 'issue' && c[2] === 'comment')
			.find(c => c.some(a => typeof a === 'string' && a.includes('insrc:review')));
		assert.ok(reviewComment, 'a review comment carrying the insrc:review marker was posted on the Epic issue');
	} finally { s.cleanup(); _setTrackerExecForTests(); }
});

// ---------------------------------------------------------------------------
// The adapter behind the three push functions (s1/t7): same gh sequence,
// same best-effort behaviour, same persisted TrackerMeta as the direct gh calls.
// ---------------------------------------------------------------------------

/** A fake gh that can fail chosen commands. REST issue creates answer { number, id }. */
function makeFailableGh(failOn: (args: readonly string[]) => boolean = () => false) {
	let n = 0;
	const calls: string[][] = [];
	const fn: TrackerExec = (cmd, args) => {
		calls.push([cmd, ...args]);
		if (cmd === 'git') return 'git@github.com:acme/demo.git\n';
		if (failOn(args)) throw new Error('boom');
		if (args[0] === 'api' && args.includes('POST') && (args.find(a => a.startsWith('repos/')) ?? '').endsWith('/issues')) {
			n += 1;
			return JSON.stringify({ number: n, id: 1000 + n });
		}
		if (args[0] === 'issue' && args[1] === 'view') return args.includes('body') ? 'epic body' : '{}';
		return '';
	};
	return { fn, calls };
}

/** setup() plus a plan with two tasks and task push (and optionally milestones) switched on. */
function setupWithPlan(useMilestones = false): ReturnType<typeof setup> & { planJson: string } {
	const s = setup();
	writeFileSync(join(s.repo, 'github.json'), JSON.stringify({ default: { type: 'github', pushTasks: true, useMilestones } }));
	const planJson = planArtifactPaths(s.repo, HASH, 's1', CREATED, 'epic', SLUG).json;
	writeJson(planJson, {
		meta: { workflow: 'plan', runId: 'p1', repoPath: s.repo, epicHash: HASH, epicSlug: SLUG, storyId: 's1', lldRunId: 'l1', lldEffectiveHash: 'deadbeefcafe', schemaVersion: 1 },
		body: {
			tasks: [
				{ id: 't1', title: 'Add filter input', summary: 's', size: 'S', order: 1, dependsOn: [], acceptanceChecks: ['renders'], derivedFrom: [], tests: [] },
				{ id: 't2', title: 'Filter the list', summary: 's', size: 'S', order: 2, dependsOn: ['t1'], acceptanceChecks: ['filters'], derivedFrom: [], tests: [] },
			],
			testStrategyCoverage: [],
		},
		citations: [],
	});
	return { ...s, planJson };
}

/** One call reduced to its shape: the repo path, titles and bodies are masked. */
function shapeOf(call: readonly string[]): string {
	const args = call.slice(1).map((a, i, all) => (all[i - 1] === '-C' ? '<repo>' : a));
	return args.map(a => (a.startsWith('title=') || a.startsWith('body=') ? `${a.split('=')[0]}=…` : a)).join(' ');
}

function runAll(s: ReturnType<typeof setupWithPlan>) {
	return [autoPushEpicOnHld(s.hldJson), autoPushStoryOnLld(s.lldJson), autoPushTasksOnPlan(s.planJson)];
}

const API_ISSUES = 'api -X POST repos/acme/demo/issues';
const LABEL = (name: string): string => `label create ${name} --repo acme/demo --force`;
const UNIT = (suffix: string): string => `insrc:unit:${HASH}${suffix}`;
const TITLE_LIST = 'api --paginate repos/acme/demo/issues?state=all&per_page=100 -q .[] | select(.pull_request | not) | {number, title}';
const GATE = ['-C <repo> remote get-url origin', 'auth status'];
const TYPED = (labels: string[], type: string): string => `${API_ISSUES} -f title=… -f body=… ${labels.map(l => `-f labels[]=${l}`).join(' ')} -f type=${type}`;

test('the three push functions keep their gh sequence, best-effort behaviour and TrackerMeta through the adapter', () => {
	// Plain run: the exact gh sequence, results and persisted meta.
	const gh = makeFailableGh();
	_setTrackerExecForTests(gh.fn);
	const s = setupWithPlan();
	try {
		const [epic, story, tasks] = runAll(s);
		assert.deepEqual([epic.status, story.status, tasks.status], ['created', 'created', 'created']);
		assert.deepEqual(gh.calls.filter(c => c[0] === 'gh' || c[0] === 'git').map(shapeOf), [
			...GATE,
			'issue list --repo acme/demo --state all --json number -q .[0].number --label insrc:epic --label epic:demo-feature',
			// the guard: the unit label, then the title's artifact id, before anything is created
			`issue list --repo acme/demo --state all --json number -q .[0].number --label epic:demo-feature --label ${UNIT('')}`, TITLE_LIST,
			LABEL('insrc:epic'), LABEL('insrc:story'), LABEL('epic:demo-feature'), LABEL('insrc:in-progress'), LABEL('insrc:blocked'), LABEL(UNIT('')),
			TYPED(['insrc:epic', 'epic:demo-feature', UNIT('')], 'Epic'),
			...GATE,
			`issue list --repo acme/demo --state all --json number -q .[0].number --label epic:demo-feature --label ${UNIT(':s1')}`, TITLE_LIST,
			LABEL(UNIT(':s1')),
			TYPED(['insrc:story', 'epic:demo-feature', UNIT(':s1')], 'Story'),
			'api -X POST repos/acme/demo/issues/1/sub_issues -F sub_issue_id=1002',
			'issue view 1 --repo acme/demo --json body -q .body',
			...GATE,
			LABEL('insrc:task'), LABEL('epic:demo-feature'),
			`issue list --repo acme/demo --state all --json number -q .[0].number --label epic:demo-feature --label ${UNIT(':s1:t1')}`, TITLE_LIST,
			LABEL(UNIT(':s1:t1')),
			TYPED(['insrc:task', 'epic:demo-feature', UNIT(':s1:t1')], 'Task'),
			'api -X POST repos/acme/demo/issues/2/sub_issues -F sub_issue_id=1003',
			`issue list --repo acme/demo --state all --json number -q .[0].number --label epic:demo-feature --label ${UNIT(':s1:t2')}`, TITLE_LIST,
			LABEL(UNIT(':s1:t2')),
			TYPED(['insrc:task', 'epic:demo-feature', UNIT(':s1:t2')], 'Task'),
			'api -X POST repos/acme/demo/issues/2/sub_issues -F sub_issue_id=1004',
		].map(x => x.replace(/ +/g, ' ')));
		const strip = (jsonPath: string): Record<string, unknown> => { const { pushedAt: _p, ...rest } = trackerOf(jsonPath) as Record<string, unknown>; return rest; };
		assert.deepEqual(strip(s.hldJson), { adapter: 'github', epicRef: 'acme/demo#1', labelsCreated: ['insrc:epic', 'insrc:story', 'epic:demo-feature', 'insrc:in-progress', 'insrc:blocked', UNIT('')] });
		assert.deepEqual(strip(s.lldJson), { adapter: 'github', storyRef: 'acme/demo#2' });
		assert.deepEqual(strip(s.planJson), { adapter: 'github', taskRefs: { t1: 'acme/demo#3', t2: 'acme/demo#4' }, labelsCreated: ['insrc:task', 'epic:demo-feature'] });
	} finally { s.cleanup(); }

	// Milestones switched on: the same sequence plus the milestone steps, in the same places.
	const ms = makeFailableGh();
	_setTrackerExecForTests(ms.fn);
	const m = setupWithPlan(true);
	try {
		runAll(m);
		const shapes = ms.calls.filter(c => c[0] === 'gh').map(shapeOf);
		const at = shapes.indexOf('api -X POST repos/acme/demo/milestones -f title=…');
		assert.ok(at > 0);
		assert.equal(shapes[at - 1], TYPED(['insrc:epic', 'epic:demo-feature', UNIT('')], 'Epic'));
		assert.equal(shapes[at + 1], 'issue edit 1 --repo acme/demo --milestone demo-feature');
		assert.ok(shapes.includes('issue edit 2 --repo acme/demo --milestone demo-feature'));
	} finally { m.cleanup(); }

	// Best-effort side effects: links, milestones, comments and the body edit failing never fail a push.
	for (const [name, failOn] of [
		['links', (a: readonly string[]) => a.some(x => x.includes('sub_issues'))],
		['comments', (a: readonly string[]) => a[0] === 'issue' && a[1] === 'comment'],
		['body edit', (a: readonly string[]) => a[0] === 'issue' && (a[1] === 'view' || a[1] === 'edit')],
		['labels', (a: readonly string[]) => a[0] === 'label'],
	] as const) {
		const f = makeFailableGh(failOn);
		_setTrackerExecForTests(f.fn);
		const x = setupWithPlan(true);
		try {
			assert.deepEqual(runAll(x).map(r => r.status), ['created', 'created', 'created'], name);
		} finally { x.cleanup(); }
	}

	// Fail-open when gh is unavailable: every push is skipped and no tracker call is made.
	const down = makeFailableGh(() => true);
	_setTrackerExecForTests(down.fn);
	const d = setupWithPlan();
	try {
		assert.deepEqual(runAll(d).map(r => r.status), ['skipped', 'skipped', 'skipped']);
		assert.equal(down.calls.filter(c => c[0] === 'gh').every(c => c[1] === 'auth'), true);
	} finally { d.cleanup(); }
});

test('a failing lookup in front of the create is a failed result, never a throw, and creates nothing', () => {
	const gh = makeFailableGh(a => a[0] === 'issue' && a[1] === 'list');
	_setTrackerExecForTests(gh.fn);
	const s = setupWithPlan();
	try {
		const r = autoPushEpicOnHld(s.hldJson);
		assert.equal(r.status, 'failed');
		assert.match(r.status === 'failed' ? r.reason : '', /cannot look up the issue/);
		const shapes = gh.calls.filter(c => c[0] === 'gh').map(shapeOf);
		assert.ok(shapes.some(x => x.startsWith('issue list ')), 'the lookup ran');
		assert.ok(!shapes.some(x => x.startsWith('api -X POST repos/acme/demo/issues ')), 'and no issue was created');
		assert.deepEqual(trackerOf(s.hldJson), {}, 'nothing persisted');
	} finally { s.cleanup(); }
});

test('a failing create is reported as a failed result, not thrown', () => {
	const failCreate = (label: string) => (a: readonly string[]) => a[0] === 'api' && a.some(x => x === `labels[]=${label}`);
	const epic = makeFailableGh(failCreate('insrc:epic'));
	_setTrackerExecForTests(epic.fn);
	const s = setupWithPlan();
	try {
		const r = autoPushEpicOnHld(s.hldJson);
		assert.equal(r.status, 'failed');
		assert.match(r.status === 'failed' ? r.reason : '', /^gh issue create failed: boom/);
		assert.deepEqual(trackerOf(s.hldJson), {}, 'nothing persisted for a failed create');
	} finally { s.cleanup(); }

	// Story and Task creates fail the same way, as a result and not a throw.
	const story = makeFailableGh(failCreate('insrc:story'));
	_setTrackerExecForTests(story.fn);
	const t = setupWithPlan();
	try {
		autoPushEpicOnHld(t.hldJson);
		const r = autoPushStoryOnLld(t.lldJson);
		assert.equal(r.status, 'failed');
		assert.match(r.status === 'failed' ? r.reason : '', /^gh issue create failed: boom/);
	} finally { t.cleanup(); }

	const task = makeFailableGh(failCreate('insrc:task'));
	_setTrackerExecForTests(task.fn);
	const u = setupWithPlan();
	try {
		autoPushEpicOnHld(u.hldJson);
		autoPushStoryOnLld(u.lldJson);
		const r = autoPushTasksOnPlan(u.planJson);
		assert.equal(r.status, 'failed');
		assert.match(r.status === 'failed' ? r.reason : '', /^gh issue create \(task t1\) failed: boom/);
	} finally { u.cleanup(); }
});
