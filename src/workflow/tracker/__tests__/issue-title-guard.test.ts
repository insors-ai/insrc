/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Every issue create is guarded (s1/t12): an issue made earlier is found by its unit label or by
 * the artifact id its title starts with and adopted; s10 is never taken for s1 or t10 for t1;
 * several matches, or a failed lookup, create nothing. The team path (ensureUnitIssueDetailed) and the
 * individual mode (tracker-auto) both write artifact-id titles and markers.
 *
 * Run: npx tsx --test src/workflow/tracker/__tests__/issue-title-guard.test.ts
 */

import { afterEach, test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { _setAutoPushDepsForTests, autoPushEpicOnHld, autoPushStoryOnLld, autoPushTasksOnPlan } from '../../tracker-auto.js';
import { artifactJsonPath, defineArtifactId, hldArtifactId, lldArtifactId, planArtifactId } from '../../storage.js';
import { _setTrackerExecForTests } from '../github.js';
import { parseIdMarker } from '../conventions.js';
import { titleMatchesToken, type CreatedIssue, type IssueRef, type IssueSpec, type PortResult, type TrackerPort } from '../port.js';
import { unitLabel } from '../unit-issue.js';
import { ensureUnitIssueDetailed } from '../unit-issue.js';
import type { PolicyReader, TeamPolicy } from '../../team/types.js';
import type { UnitRef } from '../refs.js';

const HASH = 'a3f4b8c9d1e2f3a4';
const SLUG = 'tag-filtering';
const CREATED = '2026-07-17T07:42:28.275Z';
const OK: PortResult<void> = { ok: true, value: undefined };
const EPIC_ID = `EPIC-${HASH}`;
const STORY_ID = `STORY-${HASH}-s1`;
const TASK_ID = `TASK-${HASH}-s1-t1`;

const teamPolicy: PolicyReader = () => ({ ok: true, value: { teamMode: true } as unknown as TeamPolicy });
const individualPolicy: PolicyReader = () => ({ ok: true, value: 'none' });

afterEach(() => { _setAutoPushDepsForTests(); _setTrackerExecForTests(); });

interface Issue { ref: IssueRef; spec: IssueSpec }

/** An in-memory tracker; `failTitle` makes the title lookup fail, `staleLabels` makes the label lookups answer "none". */
function fakeTracker(seeded: readonly Issue[] = [], over: { failTitle?: boolean } = {}) {
	const issues: Issue[] = [...seeded];
	const log = { creates: 0 };
	const port = {
		kind: 'github', capabilities: new Set(['issue-create']),
		whoAmI: () => ({ ok: true, value: 'me' }),
		findIssue: (labels: string[]): PortResult<IssueRef | null> => ({ ok: true, value: issues.find(i => labels.every(l => i.spec.labels.includes(l)))?.ref ?? null }),
		findIssues: (labels: string[]): PortResult<IssueRef[]> => ({ ok: true, value: issues.filter(i => labels.every(l => i.spec.labels.includes(l))).map(i => i.ref) }),
		findIssuesByTitleToken: (token: string): PortResult<IssueRef[]> => over.failTitle === true
			? { ok: false, reason: 'gh timed out', kind: 'unreachable' }
			: { ok: true, value: issues.filter(i => titleMatchesToken(i.spec.title, token)).map(i => i.ref) },
		issueOps: {
			ensureLabel: () => true,
			create: (spec: IssueSpec): PortResult<CreatedIssue> => {
				log.creates += 1;
				const ref = `acme/demo#${issues.length + 100}`;
				issues.push({ ref, spec });
				return { ok: true, value: { ref, id: 1000 + issues.length, typed: true } };
			},
			resolveIssueId: (ref: IssueRef) => ({ ok: true, value: 5000 + Number(ref.split('#')[1]) }),
			linkSubIssue: () => OK, comment: () => OK, close: () => OK,
			readBody: (ref: IssueRef) => ({ ok: true, value: issues.find(i => i.ref === ref)?.spec.body ?? '' }),
			writeBody: () => OK, ensureMilestone: () => undefined, attachMilestone: () => OK,
		},
	} as unknown as TrackerPort;
	return { port, issues, log };
}

function seed(): { repo: string; hld: string; lld: string; plan: string; cleanup: () => void } {
	const repo = mkdtempSync(join(tmpdir(), 'insrc-issue-guard-'));
	mkdirSync(join(repo, '.insrc', 'artifacts'), { recursive: true });
	const cfg = join(repo, 'github.json');
	writeFileSync(cfg, JSON.stringify({ repos: { [repo]: { type: 'github', owner: 'acme', repo: 'demo', pushTasks: true } } }));
	const prior = process.env['INSRC_GITHUB_CONFIG'];
	process.env['INSRC_GITHUB_CONFIG'] = cfg;
	const put = (id: string, doc: unknown): string => { const p = artifactJsonPath(repo, id); writeFileSync(p, JSON.stringify(doc, null, 2) + '\n'); return p; };
	const base = { repoPath: repo, epicHash: HASH, epicSlug: SLUG, createdAt: CREATED, epicCreatedAt: CREATED };
	put(defineArtifactId(HASH), {
		meta: { workflow: 'define', runId: 'd1', ...base, schemaVersion: 1 },
		body: {
			flavor: 'enhancement', problem: 'Users cannot filter todos by tag today. Only status filtering exists.', nonGoals: [], assumptions: [],
			constraints: [{ id: 'k1', text: 'Reuse the sidebar', type: 'convention', source: 'c1' }],
			stories: [{ id: 's1', title: 'Filter by tag', userValue: 'find todos faster', acceptanceCriteria: [] }], openQuestions: [],
		},
		citations: [],
	});
	const hld = put(hldArtifactId(HASH), { meta: { workflow: 'design.epic', runId: 'h1', ...base, schemaVersion: 1 }, body: { frameworkSummary: 'A tag filter.', chosenAlternative: 'a1', sharedContracts: [], rolloutOverview: { phases: [] }, openQuestions: [] }, citations: [] });
	const lld = put(lldArtifactId(HASH, 's1'), { meta: { workflow: 'design.story', runId: 'l1', ...base, storyId: 's1', hldBaseRunId: 'h1', hldEffectiveHash: 'deadbeefcafe0000', hldAmendmentsApplied: [], schemaVersion: 1 }, body: { chosenAlternative: 'a1', contractDetails: { surfaceLevel: 'internal', api: [] }, testStrategy: { testFramework: 'node:test', testLevels: [] } }, citations: [] });
	const plan = put(planArtifactId(HASH, 's1'), {
		meta: { workflow: 'plan', runId: 'p1', ...base, storyId: 's1', schemaVersion: 1 },
		body: { tasks: [{ id: 't1', title: 'Add the input', summary: 's', size: 'S', order: 1, dependsOn: [], acceptanceChecks: ['renders'], derivedFrom: [], tests: [] }], testStrategyCoverage: [] }, citations: [],
	});
	return {
		repo, hld, lld, plan,
		cleanup: () => { if (prior === undefined) delete process.env['INSRC_GITHUB_CONFIG']; else process.env['INSRC_GITHUB_CONFIG'] = prior; rmSync(repo, { recursive: true, force: true }); },
	};
}

const epic = (repo: string): UnitRef => ({ unit: 'epic', repoPath: repo, epicHash: HASH });
const story = (repo: string): UnitRef => ({ unit: 'story', repoPath: repo, epicHash: HASH, storyId: 's1' });
const task = (repo: string): UnitRef => ({ unit: 'task', repoPath: repo, epicHash: HASH, storyId: 's1', taskId: 't1' });

/** Runs the three pushes of the given mode against the tracker. */
function pushAll(fx: ReturnType<typeof seed>, t: ReturnType<typeof fakeTracker>, mode: 'team' | 'individual') {
	_setTrackerExecForTests(() => '');   // gh sign-in check for the push path
	_setAutoPushDepsForTests(mode === 'team'
		? { policy: teamPolicy, port: t.port }
		: { policy: individualPolicy, port: t.port });
	return [autoPushEpicOnHld(fx.hld), autoPushStoryOnLld(fx.lld), autoPushTasksOnPlan(fx.plan)];
}

test('tracker-auto in team mode and individual mode writes artifact-id titles and markers', () => {
	for (const mode of ['team', 'individual'] as const) {
		const fx = seed();
		try {
			const t = fakeTracker();
			const results = pushAll(fx, t, mode);
			assert.deepEqual(results.map(r => r.status), ['created', 'created', 'created'], `${mode}: ${JSON.stringify(results)}`);
			const byTitle = (id: string): Issue => {
				const hit = t.issues.find(i => i.spec.title.startsWith(`${id} — `));
				assert.ok(hit !== undefined, `${mode}: an issue titled ${id}; have ${t.issues.map(i => i.spec.title).join(' | ')}`);
				return hit;
			};
			for (const id of [EPIC_ID, STORY_ID, TASK_ID]) {
				const issue = byTitle(id);
				assert.equal(issue.spec.body.split('\n')[0], `<!-- insrc:id ${id} -->`, `${mode}: the first body line is the marker`);
				assert.equal(parseIdMarker(issue.spec.body), id);
			}
			// the Story and Task issues carry their unit label so they are found by it next time
			assert.ok(byTitle(STORY_ID).spec.labels.includes(unitLabel(story(fx.repo))), `${mode}: Story unit label`);
			assert.ok(byTitle(TASK_ID).spec.labels.includes(unitLabel(task(fx.repo))), `${mode}: Task unit label`);
			assert.ok(byTitle(EPIC_ID).spec.labels.includes(unitLabel(epic(fx.repo))), `${mode}: Epic unit label`);
		} finally { fx.cleanup(); }
	}
});

test('an issue created earlier is adopted by its unit label or an exact artifact-id title', () => {
	for (const mode of ['team', 'individual'] as const) {
		const fx = seed();
		try {
			// the Epic issue is found by its artifact-id title alone (no labels at all); the Story issue has the unit label and an old title
			const t = fakeTracker([
				{ ref: 'acme/demo#7', spec: { title: `${EPIC_ID} — Users cannot filter todos by tag today.`, body: 'x', labels: [] } as IssueSpec },
				{ ref: 'acme/demo#8', spec: { title: 'E20260717a3f4b8c9:S001 — Filter by tag', body: 'x', labels: ['insrc:story', `epic:${SLUG}`, unitLabel(story(fx.repo))] } as IssueSpec },
			]);
			const results = pushAll(fx, t, mode);
			assert.equal(results[0]!.status, mode === 'team' ? 'already-exists' : 'already-exists', `${mode} epic: ${JSON.stringify(results[0])}`);
			assert.equal(results[1]!.status, 'already-exists', `${mode} story: ${JSON.stringify(results[1])}`);
			assert.equal((results[0] as { epicRef?: string }).epicRef, 'acme/demo#7');
			assert.equal((results[1] as { storyRef?: string }).storyRef, 'acme/demo#8');
			// only the Task issue was new
			assert.deepEqual(t.issues.slice(2).map(i => i.spec.title.split(' ')[0]), [TASK_ID], `${mode}: only the Task was created`);
		} finally { fx.cleanup(); }
	}
});

test('a Task issue found by its title alone is adopted, and a Story with two unit-label matches creates nothing', () => {
	const titleOnly = seed();
	try {
		const t = fakeTracker([{ ref: 'acme/demo#8', spec: { title: `${TASK_ID} — Add the input`, body: 'x', labels: [] } as IssueSpec }]);
		const results = pushAll(titleOnly, t, 'individual');
		assert.equal(results[2]!.status, 'already-exists', JSON.stringify(results[2]));
		assert.equal(t.issues.filter(i => i.spec.title.startsWith(`${TASK_ID} — `)).length, 1, 'no second Task issue');
	} finally { titleOnly.cleanup(); }
	for (const mode of ['team', 'individual'] as const) {
		const twice = seed();
		try {
			const labels = ['insrc:story', `epic:${SLUG}`, unitLabel(story(twice.repo))];
			const t = fakeTracker([
				{ ref: 'acme/demo#8', spec: { title: 'an old title', body: 'x', labels } as IssueSpec },
				{ ref: 'acme/demo#9', spec: { title: 'another old title', body: 'x', labels } as IssueSpec },
			]);
			const results = pushAll(twice, t, mode);
			assert.equal(results[1]!.status, 'failed', `${mode}: ${JSON.stringify(results[1])}`);
			assert.match((results[1] as { reason: string }).reason, /issues carry the label/);
			assert.ok(!t.issues.some(i => i.spec.title.startsWith(`${STORY_ID} — `)), `${mode}: no Story issue was created`);
		} finally { twice.cleanup(); }
	}
});

test('two Epic issues carrying the Epic labels are refused on both paths and nothing is created', () => {
	for (const mode of ['team', 'individual'] as const) {
		const fx = seed();
		try {
			const labels = ['insrc:epic', `epic:${SLUG}`, unitLabel(epic(fx.repo))];
			const t = fakeTracker([
				{ ref: 'acme/demo#7', spec: { title: 'an old epic', body: 'x', labels } as IssueSpec },
				{ ref: 'acme/demo#9', spec: { title: 'another old epic', body: 'x', labels } as IssueSpec },
			]);
			const results = pushAll(fx, t, mode);
			assert.equal(results[0]!.status, 'failed', `${mode}: ${JSON.stringify(results[0])}`);
			assert.equal(t.issues.length, 2, `${mode}: nothing was created`);
		} finally { fx.cleanup(); }
	}
});

test('a failed Epic label lookup in individual mode creates no Epic issue', () => {
	const fx = seed();
	try {
		const t = fakeTracker();
		(t.port as unknown as { findIssue: () => PortResult<IssueRef | null> }).findIssue = () => ({ ok: false, reason: 'gh timed out', kind: 'unreachable' });
		const results = pushAll(fx, t, 'individual');
		assert.equal(results[0]!.status, 'failed', JSON.stringify(results[0]));
		assert.equal(t.issues.length, 0, 'nothing was created');
	} finally { fx.cleanup(); }
});

test('s10 is never matched for s1 and t10 never for t1, several matches and a failed lookup create nothing', () => {
	// a longer id is not the same issue: s10 and t10 issues exist, and s1 / t1 are still created
	const longer = seed();
	try {
		const t = fakeTracker([
			{ ref: 'acme/demo#7', spec: { title: `EPIC-${HASH} — the epic`, body: 'x', labels: ['insrc:epic', `epic:${SLUG}`, unitLabel(epic(longer.repo))] } as IssueSpec },
			{ ref: 'acme/demo#8', spec: { title: `STORY-${HASH}-s10 — the tenth story`, body: 'x', labels: ['insrc:story'] } as IssueSpec },
			{ ref: 'acme/demo#9', spec: { title: `TASK-${HASH}-s1-t10 — the tenth task`, body: 'x', labels: ['insrc:task'] } as IssueSpec },
		]);
		const results = pushAll(longer, t, 'team');
		assert.equal(results[1]!.status, 'created', 'the s1 Story issue is its own');
		assert.equal(results[2]!.status, 'created', 'the t1 Task issue is its own');
		assert.notEqual((results[1] as { storyRef?: string }).storyRef, 'acme/demo#8');
		assert.equal(t.log.creates, 2);
	} finally { longer.cleanup(); }

	// several issues carry the Story's title: nothing is created, on both paths
	for (const mode of ['team', 'individual'] as const) {
		const dup = seed();
		try {
			const epicIssue: Issue = { ref: 'acme/demo#7', spec: { title: `${EPIC_ID} — the epic`, body: 'x', labels: ['insrc:epic', `epic:${SLUG}`, unitLabel(epic(dup.repo))] } as IssueSpec };
			const t = fakeTracker([
				epicIssue,
				{ ref: 'acme/demo#8', spec: { title: `${STORY_ID} — first`, body: 'x', labels: ['insrc:story'] } as IssueSpec },
				{ ref: 'acme/demo#9', spec: { title: `${STORY_ID} — second`, body: 'x', labels: ['insrc:story'] } as IssueSpec },
			]);
			const results = pushAll(dup, t, mode);
			assert.equal(results[1]!.status, 'failed', `${mode}: ${JSON.stringify(results[1])}`);
			assert.match((results[1] as { reason: string }).reason, /issues are titled/);
			assert.equal(t.log.creates, 0, `${mode}: nothing was created`);
		} finally { dup.cleanup(); }
	}

	// a failed title lookup creates nothing, on both paths and through ensureUnitIssueDetailed
	for (const mode of ['team', 'individual'] as const) {
		const lost = seed();
		try {
			const t = fakeTracker([], { failTitle: true });
			const results = pushAll(lost, t, mode);
			assert.equal(results[0]!.status, 'failed', `${mode}: ${JSON.stringify(results[0])}`);
			assert.equal(t.log.creates, 0, `${mode}: nothing was created`);
		} finally { lost.cleanup(); }
	}
	const direct = seed();
	try {
		const t = fakeTracker([], { failTitle: true });
		const out = ensureUnitIssueDetailed(epic(direct.repo), t.port, { readConfig: () => ({ type: 'github', owner: 'acme', repo: 'demo', epicLabel: 'insrc:epic', storyLabel: 'insrc:story', taskLabel: 'insrc:task', useMilestones: false, pushTasks: true, commitArtifacts: false, taskIssueType: 'Task', epicIssueType: 'Epic', storyIssueType: 'Story', source: 'per-repo-config' }) });
		assert.equal(out.ok, false);
		assert.equal(t.log.creates, 0);
	} finally { direct.cleanup(); }
});
