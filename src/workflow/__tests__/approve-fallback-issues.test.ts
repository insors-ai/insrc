/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * The approve-time pushes (the terminal approve fallback) in team mode and in
 * legacy mode. Team mode adopts the issues the draft hook made, creates the rest,
 * forces Task issues and runs each extra once; legacy mode (no policy, or
 * teamMode false) is today's behaviour.
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

const HASH = 'a3f4b8c9d1e2f3a4';
const SLUG = 'tag-filtering';
const CREATED = '2026-07-17T07:42:28.275Z';
const OK: PortResult<void> = { ok: true, value: undefined };

const TEAM = { teamMode: true } as unknown as TeamPolicy;
const teamPolicy: PolicyReader = () => ({ ok: true, value: TEAM });
const offPolicy: PolicyReader = () => ({ ok: true, value: { teamMode: false } as unknown as TeamPolicy });
const nonePolicy: PolicyReader = () => ({ ok: true, value: 'none' });
const brokenPolicy: PolicyReader = () => ({ ok: false, reason: 'the default branch cannot be read' });

// ---------------------------------------------------------------------------
// An in-memory tracker that records what is posted
// ---------------------------------------------------------------------------

function fakeTracker(over: { failFind?: boolean; failComment?: string } = {}) {
	const issues: Array<{ ref: IssueRef; spec: IssueSpec }> = [];
	const bodies = new Map<string, string>();
	const log = { creates: 0, comments: [] as Array<[string, string]>, writeBodies: 0 };
	const port = {
		kind: 'github', capabilities: new Set(['issue-create']),
		findIssues: (labels: string[]): PortResult<IssueRef[]> => ({ ok: true, value: issues.filter(i => labels.every(l => i.spec.labels.includes(l))).map(i => i.ref) }),
		findIssuesByTitleToken: (token: string): PortResult<IssueRef[]> => ({ ok: true, value: issues.filter(i => titleMatchesToken(i.spec.title, token)).map(i => i.ref) }),
		findIssue: (labels: string[]): PortResult<IssueRef | null> => {
			if (over.failFind === true) return { ok: false, reason: 'gh timed out', kind: 'unreachable' };
			return { ok: true, value: issues.find(i => labels.every(l => i.spec.labels.includes(l)))?.ref ?? null };
		},
		issueOps: {
			ensureLabel: () => true,
			create: (spec: IssueSpec): PortResult<CreatedIssue> => {
				log.creates += 1;
				const ref = `acme/demo#${issues.length + 1}`;
				issues.push({ ref, spec }); bodies.set(ref, spec.body);
				return { ok: true, value: { ref, id: 1000 + issues.length, typed: true } };
			},
			linkSubIssue: () => OK,
			comment: (ref: IssueRef, body: string): PortResult<void> => {
				if (over.failComment !== undefined && body.includes(over.failComment)) return { ok: false, reason: 'comment rejected', kind: 'rejected' };
				log.comments.push([ref, body]); return OK;
			},
			readBody: (ref: IssueRef): PortResult<string> => ({ ok: true, value: bodies.get(ref) ?? '' }),
			writeBody: (ref: IssueRef, body: string): PortResult<void> => { log.writeBodies += 1; bodies.set(ref, body); return OK; },
			ensureMilestone: () => undefined,
			attachMilestone: () => OK,
		},
	} as unknown as TrackerPort;
	return { port, issues, log };
}

// ---------------------------------------------------------------------------
// A repo with a Define, HLD, LLD and a two-Task plan
// ---------------------------------------------------------------------------

interface Fx { repo: string; hld: string; lld: string; plan: string; cleanup: () => void }

function seed(opts: { pushTasks?: boolean } = {}): Fx {
	const repo = mkdtempSync(join(tmpdir(), 'insrc-approve-fallback-'));
	mkdirSync(join(repo, '.insrc', 'artifacts'), { recursive: true });
	const cfg = join(repo, 'github.json');
	writeFileSync(cfg, JSON.stringify({ repos: { [repo]: { type: 'github', owner: 'acme', repo: 'demo', pushTasks: opts.pushTasks ?? false } } }));
	const prior = process.env['INSRC_GITHUB_CONFIG'];
	process.env['INSRC_GITHUB_CONFIG'] = cfg;
	const put = (id: string, doc: unknown): string => { const p = artifactJsonPath(repo, id); writeFileSync(p, JSON.stringify(doc, null, 2) + '\n'); return p; };
	const base = { repoPath: repo, epicHash: HASH, epicSlug: SLUG, createdAt: CREATED };
	put(defineArtifactId(HASH), {
		meta: { workflow: 'define', runId: 'd1', ...base, schemaVersion: 1 },
		body: {
			flavor: 'enhancement', problem: 'Users cannot filter todos by tag today. Only status filtering exists.', nonGoals: [], assumptions: [],
			constraints: [{ id: 'k1', text: 'Reuse the sidebar', type: 'convention', source: 'c1' }],
			stories: [{ id: 's1', title: 'Filter by tag', userValue: 'find todos faster', acceptanceCriteria: [] }], openQuestions: [],
		},
		citations: [],
	});
	const review = { artifact: 'LLD', stage: 'design.story', verdict: 'pass', findings: [], counts: { high: 0, med: 0, low: 0 }, reviewedAt: '2026-07-21T00:00:00.000Z', model: 'm' };
	const hld = put(hldArtifactId(HASH), {
		meta: { workflow: 'design.epic', runId: 'h1', ...base, schemaVersion: 1 },
		body: { frameworkSummary: 'A tag filter.', chosenAlternative: 'a1', sharedContracts: [], rolloutOverview: { phases: [] }, openQuestions: [] }, citations: [],
	});
	const lld = put(lldArtifactId(HASH, 's1'), {
		meta: { workflow: 'design.story', runId: 'l1', ...base, storyId: 's1', hldBaseRunId: 'h1', hldEffectiveHash: 'deadbeefcafe0000', hldAmendmentsApplied: [], schemaVersion: 1, review },
		body: { chosenAlternative: 'a1', contractDetails: { surfaceLevel: 'internal', api: [] }, testStrategy: { testFramework: 'node:test', testLevels: [] } }, citations: [],
	});
	const plan = put(planArtifactId(HASH, 's1'), {
		meta: { workflow: 'plan', runId: 'p1', ...base, storyId: 's1', schemaVersion: 1, review },
		body: { tasks: [
			{ id: 't1', title: 'Add the input', summary: 's', size: 'S', order: 1, dependsOn: [], acceptanceChecks: ['renders'], derivedFrom: [], tests: [] },
			{ id: 't2', title: 'Filter the list', summary: 's', size: 'S', order: 2, dependsOn: ['t1'], acceptanceChecks: ['filters'], derivedFrom: [], tests: [] },
		], testStrategyCoverage: [] }, citations: [],
	});
	return {
		repo, hld, lld, plan,
		cleanup: () => { if (prior === undefined) delete process.env['INSRC_GITHUB_CONFIG']; else process.env['INSRC_GITHUB_CONFIG'] = prior; _setTrackerExecForTests(); _setAutoPushDepsForTests(); rmSync(repo, { recursive: true, force: true }); },
	};
}

const trackerOf = (path: string): Record<string, any> => JSON.parse(readFileSync(path, 'utf8')).meta.tracker ?? {};
/** Runs one push with the tracker and policy injected (the exported push functions take only the path). */
const via = (t: ReturnType<typeof fakeTracker>, policy: PolicyReader = teamPolicy) =>
	<T>(run: () => T): T => { _setAutoPushDepsForTests({ policy, port: t.port }); try { return run(); } finally { _setAutoPushDepsForTests(); } };

// ---------------------------------------------------------------------------

test('in team mode the three pushes adopt, force Task issues, fail on lookup or unreadable policy, and run extras once', () => {
	const fx = seed({ pushTasks: false });
	try {
		const t = fakeTracker();
		// the draft hook already made the Epic and the Story issue
		const e0 = ensureUnitIssueDetailed({ unit: 'epic', repoPath: fx.repo, epicHash: HASH }, t.port); assert.equal(e0.ok, true, JSON.stringify(e0));
		assert.equal(ensureUnitIssueDetailed({ unit: 'story', repoPath: fx.repo, epicHash: HASH, storyId: 's1' }, t.port).ok, true);
		assert.equal(t.log.creates, 2);

		// Epic approve: adopts, posts the HLD summary and the review once
		const epic = via(t)(() => autoPushEpicOnHld(fx.hld));
		assert.deepEqual(epic, { status: 'already-exists', epicRef: 'acme/demo#1' });
		assert.equal(t.log.creates, 2, 'no second Epic issue');

		// Story approve: the task-list splice, the design comment and the review comment run once and are marked
		const story = via(t)(() => autoPushStoryOnLld(fx.lld));
		assert.deepEqual(story, { status: 'already-exists', storyRef: 'acme/demo#2' });
		const storyPosts = t.log.comments.filter(([ref]) => ref === 'acme/demo#2').length;
		assert.equal(storyPosts, 2, 'design comment and review comment');
		assert.equal(t.log.writeBodies, 1, 'the Epic task list was spliced');
		const before = { comments: t.log.comments.length, writes: t.log.writeBodies };
		assert.equal(via(t)(() => autoPushStoryOnLld(fx.lld)).status, 'already-exists');
		assert.equal(via(t)(() => autoPushEpicOnHld(fx.hld)).status, 'already-exists');
		assert.deepEqual({ comments: t.log.comments.length, writes: t.log.writeBodies }, before, 'a second approve posts nothing');
		assert.deepEqual((JSON.parse(readFileSync(fx.lld, 'utf8')).meta.envelope.binding.posted as Array<{ kind: string }>).map(p => p.kind).sort(), ['design', 'review', 'task-list'], 'the binding records what was posted');

		// the draft hook also made both Task issues: the plan approve adopts them and creates none
		for (const taskId of ['t1', 't2']) {
			assert.equal(ensureUnitIssueDetailed({ unit: 'task', repoPath: fx.repo, epicHash: HASH, storyId: 's1', taskId }, t.port).ok, true);
		}
		assert.equal(t.log.creates, 4);
		assert.deepEqual(via(t)(() => autoPushTasksOnPlan(fx.plan)), { status: 'already-exists', taskRefs: { t1: 'acme/demo#3', t2: 'acme/demo#4' } });
		assert.equal(t.log.creates, 4, 'no second Task issue');
	} finally { fx.cleanup(); }

	// pushTasks off: the plan approve still creates a Task issue per Task, in plan order, and a second one creates none
	const forced = seed({ pushTasks: false });
	try {
		const t = fakeTracker();
		assert.deepEqual(via(t)(() => autoPushTasksOnPlan(forced.plan)), { status: 'created', taskRefs: { t1: 'acme/demo#3', t2: 'acme/demo#4' } });
		assert.equal(via(t)(() => autoPushTasksOnPlan(forced.plan)).status, 'already-exists');
		assert.equal(t.log.creates, 4, 'the Epic, the Story and the two Tasks');
	} finally { forced.cleanup(); }

	// a failed Epic lookup is a failure and creates nothing
	const lost = seed();
	try {
		const t = fakeTracker({ failFind: true });
		const r = via(t)(() => autoPushEpicOnHld(lost.hld));
		assert.equal(r.status, 'failed');
		assert.equal(t.log.creates, 0);
	} finally { lost.cleanup(); }

	// an unreadable policy makes all three return failed, with the reason
	const bad = seed();
	try {
		const t = fakeTracker();
		for (const r of [via(t, brokenPolicy)(() => autoPushEpicOnHld(bad.hld)), via(t, brokenPolicy)(() => autoPushStoryOnLld(bad.lld)), via(t, brokenPolicy)(() => autoPushTasksOnPlan(bad.plan))]) {
			assert.equal(r.status, 'failed');
			assert.match(r.status === 'failed' ? r.reason : '', /cannot be read/);
		}
		assert.equal(t.log.creates, 0);
	} finally { bad.cleanup(); }

	// one failing extra is reported, keeps the others marked, and only it is retried
	const part = seed();
	try {
		const t = fakeTracker({ failComment: '## LLD' });
		via(t)(() => autoPushEpicOnHld(part.hld));
		const first = via(t)(() => autoPushStoryOnLld(part.lld));
		assert.deepEqual(first.status === 'created' ? first.extrasFailed?.map(f => f.name) : null, ['designComment']);
		const healed = fakeTracker();
		healed.issues.push(...t.issues);
		const second = via(healed)(() => autoPushStoryOnLld(part.lld));
		assert.equal(second.status, 'already-exists');
		assert.deepEqual(healed.log.comments.map(([, b]) => b.split('\n')[0]), ['## LLD — Story s1']);
		assert.equal(healed.log.writeBodies, 0, 'the marked task-list splice is not repeated');
	} finally { part.cleanup(); }
});

test('with no policy the three pushes behave exactly as before', () => {
	const run = (policy: PolicyReader | undefined) => {
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
			const results = [autoPushEpicOnHld(fx.hld), autoPushStoryOnLld(fx.lld), autoPushTasksOnPlan(fx.plan)];
			const masked = calls.map(c => c.map(a => a.replace(fx.repo, '<repo>')).join(' '));
			return { results, masked, hld: trackerOf(fx.hld), lld: trackerOf(fx.lld) };
		} finally { fx.cleanup(); }
	};
	const baseline = run(undefined);
	for (const policy of [nonePolicy, offPolicy]) {
		const r = run(policy);
		assert.deepEqual(r.masked, baseline.masked, 'the same gh command sequence');
		assert.deepEqual(r.results.map(x => x.status), ['created', 'created', 'skipped'], 'pushTasks off still returns skipped');
		assert.deepEqual(r.results, baseline.results);
		for (const block of [r.hld, r.lld]) assert.equal('units' in block, false, 'no per-unit record in legacy mode');
	}
});
