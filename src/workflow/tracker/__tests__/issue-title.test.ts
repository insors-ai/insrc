/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Issue titles and body markers start with the artifact id (s1/t11): an Epic, a Story and a
 * Task issue made by the unit-issue module, and the three body renderers in conventions.ts.
 *
 * Run: npx tsx --test src/workflow/tracker/__tests__/issue-title.test.ts
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { ArtifactIds } from '../../artifact-ids.js';
import { artifactJsonPath, defineArtifactId, hldArtifactId, lldArtifactId, planArtifactId } from '../../storage.js';
import type { ResolvedGithubConfig } from '../../config/github.js';
import { idMarker, parseIdMarker } from '../conventions.js';
import type { CreatedIssue, IssueRef, IssueSpec, PortResult, TrackerPort } from '../port.js';
import type { UnitRef } from '../refs.js';
import { ensureUnitIssueDetailed, unitLabel } from '../unit-issue.js';
import { seedTaskHeads } from '../../__tests__/helpers/task-heads.js';

const HASH = 'a3f4b8c9d1e2f3a4';
const CREATED = '2026-07-17T07:42:28.275Z';
const SLUG = 'tag-filtering';

const CFG: ResolvedGithubConfig = {
	type: 'github', owner: 'acme', repo: 'demo', epicLabel: 'epic', storyLabel: 'story', taskLabel: 'task',
	useMilestones: false, pushTasks: false, commitArtifacts: false, taskIssueType: 'Task', epicIssueType: 'Epic', storyIssueType: 'Story', source: 'per-repo-config',
};
const deps = { readConfig: () => CFG, now: () => '2026-10-18T00:00:00.000Z' };

interface Issue { readonly ref: IssueRef; readonly spec: IssueSpec }

/** An in-memory tracker that records what it is asked to create and finds issues by label. */
function fakeTracker(seeded: readonly Issue[] = []): { port: TrackerPort; issues: Issue[] } {
	const issues: Issue[] = [...seeded];
	const ok: PortResult<void> = { ok: true, value: undefined };
	const port = {
		kind: 'github', capabilities: new Set(['issue-create']),
		whoAmI: () => ({ ok: true, value: 'me' }),
		findIssue: (labels: string[]) => ({ ok: true, value: issues.find(i => labels.every(l => i.spec.labels.includes(l)))?.ref ?? null }),
		findIssues: (labels: string[]) => ({ ok: true, value: issues.filter(i => labels.every(l => i.spec.labels.includes(l))).map(i => i.ref) }),
		findIssuesByTitleToken: () => ({ ok: true, value: [] }),
		issueOps: {
			ensureLabel: () => true,
			create: (spec: IssueSpec): PortResult<CreatedIssue> => {
				const n = issues.length + 1;
				issues.push({ ref: `acme/demo#${n}`, spec });
				return { ok: true, value: { ref: `acme/demo#${n}`, id: 1000 + n, typed: true } };
			},
			resolveIssueId: (ref: IssueRef) => ({ ok: true, value: 1000 + Number(ref.split('#')[1]) }),
			linkSubIssue: () => ok, comment: () => ok, close: () => ok,
		},
	} as unknown as TrackerPort;
	return { port, issues };
}

function seed(): { repo: string; cleanup: () => void } {
	const repo = mkdtempSync(join(tmpdir(), 'insrc-issue-title-'));
	mkdirSync(join(repo, '.insrc', 'artifacts'), { recursive: true });
	const put = (id: string, doc: unknown): void => writeFileSync(artifactJsonPath(repo, id), JSON.stringify(doc, null, 2) + '\n');
	put(defineArtifactId(HASH), {
		meta: { workflow: 'define', runId: 'r', repoPath: repo, createdAt: CREATED, epicCreatedAt: CREATED, epicHash: HASH, epicSlug: SLUG, schemaVersion: 1 },
		body: {
			flavor: 'enhancement', problem: 'Users cannot filter todos by tag today. Only status filtering exists.', nonGoals: [], assumptions: [],
			constraints: [{ id: 'k1', text: 'Reuse the sidebar', type: 'convention', source: 'c1' }],
			stories: [{ id: 's1', title: 'Filter by tag', userValue: 'find todos faster', acceptanceCriteria: [{ id: 'ac1', given: 'g', when: 'w', then: 't', operationalizes: ['k1'] }] }],
			openQuestions: [],
		},
		citations: [],
	});
	put(hldArtifactId(HASH), { meta: { workflow: 'design.epic', epicHash: HASH, epicSlug: SLUG, createdAt: CREATED, epicCreatedAt: CREATED }, body: {}, citations: [] });
	put(lldArtifactId(HASH, 's1'), { meta: { workflow: 'design.story', epicHash: HASH, epicSlug: SLUG, storyId: 's1', createdAt: CREATED, epicCreatedAt: CREATED, revision: 2 }, body: {}, citations: [] });
	put(planArtifactId(HASH, 's1'), {
		meta: { workflow: 'plan', epicHash: HASH, epicSlug: SLUG, storyId: 's1', createdAt: CREATED, epicCreatedAt: CREATED },
		body: { tasks: [{ id: 't1', title: 'Add the filter', summary: 'Add it', size: 'S', order: 1, dependsOn: [], acceptanceChecks: ['it filters'], derivedFrom: ['c1'], tests: [] }] },
		citations: [],
	});
	seedTaskHeads(repo, HASH, 's1', ['t1'], CREATED);
	return { repo, cleanup: () => rmSync(repo, { recursive: true, force: true }) };
}

const epic = (repo: string): UnitRef => ({ unit: 'epic', repoPath: repo, epicHash: HASH });
const story = (repo: string): UnitRef => ({ unit: 'story', repoPath: repo, epicHash: HASH, storyId: 's1' });
const task = (repo: string): UnitRef => ({ unit: 'task', repoPath: repo, epicHash: HASH, storyId: 's1', taskId: 't1' });

test('unit-issue and the conventions bodies write an Epic, Story and Task title and marker that start with the artifact id', () => {
	const fx = seed();
	const cfgPath = join(fx.repo, 'github.json');
	writeFileSync(cfgPath, JSON.stringify({ repos: { [fx.repo]: { type: 'github', owner: 'acme', repo: 'demo' } } }));
	const prior = process.env['INSRC_GITHUB_CONFIG'];
	process.env['INSRC_GITHUB_CONFIG'] = cfgPath;
	try {
		const t = fakeTracker();
		for (const [unit, id, title] of [
			[epic(fx.repo), `EPIC-${HASH}`, 'Users cannot filter todos by tag today.'],
			[story(fx.repo), `STORY-${HASH}-s1`, 'Filter by tag'],
			[task(fx.repo), `TASK-${HASH}-s1-t1`, 'Add the filter'],
		] as const) {
			const out = ensureUnitIssueDetailed(unit, t.port, deps);
			assert.equal(out.ok, true, JSON.stringify(out));
			const made = t.issues[t.issues.length - 1]!;
			assert.equal(made.spec.title, `${id} — ${title}`, 'the title starts with the artifact id');
			assert.equal(made.spec.body.split('\n')[0], idMarker(id), 'the first line of the body is the marker');
			assert.equal(parseIdMarker(made.spec.body), id);
			assert.ok(ArtifactIds.parse(id) !== undefined);
		}

		// the marker of an issue written before the artifact ids is not read
		assert.equal(parseIdMarker('<!-- insrc:id E20260717a3f4b8c9:S001:T001 -->\n\nbody'), null);
		assert.equal(parseIdMarker('<!-- insrc:id E20260717a3f4b8c9-S001 -->'), null);
		assert.equal(parseIdMarker('no marker at all'), null);

		// an issue created earlier keeps its title and is still found by its unit label (a repo with no local record of it)
		const fresh = seed();
		try {
			const older = fakeTracker([
				{ ref: 'acme/demo#30', spec: { title: 'E20260717a3f4b8c9 \u2014 Epic', body: 'old', labels: ['epic', `epic:${SLUG}`, unitLabel(epic(fresh.repo))] } as IssueSpec },
				{ ref: 'acme/demo#40', spec: { title: 'E20260717a3f4b8c9:S001 \u2014 Filter by tag', body: 'old', labels: ['story', `epic:${SLUG}`, unitLabel(story(fresh.repo))] } as IssueSpec },
			]);
			const adopted = ensureUnitIssueDetailed(story(fresh.repo), older.port, deps);
			assert.equal(adopted.ok, true, JSON.stringify(adopted));
			if (adopted.ok) {
				assert.equal(adopted.value.issue, 'acme/demo#40');
				assert.equal(adopted.value.created, false);
			}
			assert.equal(older.issues.length, 2, 'no second issue was created');
			assert.equal(older.issues[1]!.spec.title, 'E20260717a3f4b8c9:S001 \u2014 Filter by tag', 'the earlier title is untouched');
		} finally { fresh.cleanup(); }
	} finally {
		if (prior === undefined) delete process.env['INSRC_GITHUB_CONFIG']; else process.env['INSRC_GITHUB_CONFIG'] = prior;
		fx.cleanup();
	}
});
