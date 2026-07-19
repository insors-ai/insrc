/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Unit + integration tests for the hierarchical workflow-id (`workflow/id.ts`)
 * and the tracker resolver (`workflow/tracker/resolve.ts`), plus the
 * issue-body id-marker embed/extract round-trip.
 *
 * Run: npx tsx --test src/workflow/__tests__/id-resolve.test.ts
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

import {
	epicWorkflowId, storyWorkflowId, taskWorkflowId,
	toCanonical, toSlug, parseWorkflowId, isWorkflowIdString,
	parentId, epicOf, isEpicId, isStoryId, isTaskId,
	storyIdToOrdinal, ordinalToStoryId, taskIdToOrdinal, ordinalToTaskId,
	type WorkflowId,
} from '../id.js';
import {
	resolveWorkflowRef, workflowIdForIssue, issueForWorkflowId,
} from '../tracker/resolve.js';
import { renderTaskBody, parseIdMarker } from '../tracker/conventions.js';
import type { PlanTask } from '../artifacts/plan.js';

// Worked example from the spec.
const EPIC_HASH = '185807ba9a6b35d3';
const CREATED   = '2026-07-17T07:42:28.275Z';
const CANON_TASK = 'E20260717185807ba:S001:T003';
const SLUG_TASK  = 'E20260717185807ba-S001-T003';

// ---------------------------------------------------------------------------
// id — the worked example, exactly
// ---------------------------------------------------------------------------

test('worked example — canonical + slug, exactly', () => {
	const t = taskWorkflowId(EPIC_HASH, CREATED, 's1', 't3');
	assert.equal(toCanonical(t), CANON_TASK);
	assert.equal(toSlug(t), SLUG_TASK);
	assert.equal(toCanonical(epicWorkflowId(EPIC_HASH, CREATED)), 'E20260717185807ba');
	assert.equal(toCanonical(storyWorkflowId(EPIC_HASH, CREATED, 's1')), 'E20260717185807ba:S001');
	// slug is exactly the canonical with ':' → '-'
	assert.equal(toSlug(t), toCanonical(t).replaceAll(':', '-'));
});

// ---------------------------------------------------------------------------
// id — round trips at all three levels (canonical ↔ struct ↔ slug)
// ---------------------------------------------------------------------------

test('round-trip canonical + slug at every level', () => {
	const ids: WorkflowId[] = [
		epicWorkflowId(EPIC_HASH, CREATED),
		storyWorkflowId(EPIC_HASH, CREATED, 's12'),
		taskWorkflowId(EPIC_HASH, CREATED, 's1', 't3'),
	];
	for (const id of ids) {
		assert.deepEqual(parseWorkflowId(toCanonical(id)), id, `canonical round-trip ${toCanonical(id)}`);
		assert.deepEqual(parseWorkflowId(toSlug(id)), id, `slug round-trip ${toSlug(id)}`);
	}
});

test('ordinal padding — <3 digits pad to 3, >=1000 keep full width', () => {
	assert.equal(toCanonical(storyWorkflowId(EPIC_HASH, CREATED, 's1')),   'E20260717185807ba:S001');
	assert.equal(toCanonical(storyWorkflowId(EPIC_HASH, CREATED, 's12')),  'E20260717185807ba:S012');
	assert.equal(toCanonical(storyWorkflowId(EPIC_HASH, CREATED, 's123')), 'E20260717185807ba:S123');
	const big = storyWorkflowId(EPIC_HASH, CREATED, 's1234');
	assert.equal(toCanonical(big), 'E20260717185807ba:S1234');
	assert.deepEqual(parseWorkflowId(toCanonical(big)), big);
});

test('parse accepts canonical AND slug for the same node', () => {
	assert.deepEqual(parseWorkflowId(CANON_TASK), parseWorkflowId(SLUG_TASK));
	assert.equal(isWorkflowIdString(CANON_TASK), true);
	assert.equal(isWorkflowIdString(SLUG_TASK), true);
	assert.equal(isWorkflowIdString('s1/t3'), false);
	assert.equal(isWorkflowIdString('nope'), false);
	assert.equal(parseWorkflowId('E[20260717185807ba]'), null);   // old bracket form rejected
	assert.equal(parseWorkflowId('Ebad'), null);
});

test('hash8 derives from epicHash slice, never re-hashed', () => {
	assert.equal(epicWorkflowId(EPIC_HASH, CREATED).hash8, EPIC_HASH.slice(0, 8));
});

test('date is UTC of createdAt', () => {
	// 00:30Z stays same day; a pre-midnight-UTC local time would not, but
	// the input is already Z so this pins the UTC read.
	assert.equal(epicWorkflowId(EPIC_HASH, '2026-01-05T23:59:59.000Z').date, '20260105');
	assert.equal(epicWorkflowId(EPIC_HASH, '2026-12-31T00:00:00.000Z').date, '20261231');
});

// ---------------------------------------------------------------------------
// id — parentId chain + predicates + epicOf
// ---------------------------------------------------------------------------

test('parentId chain task → story → epic → null', () => {
	const task  = taskWorkflowId(EPIC_HASH, CREATED, 's1', 't3');
	const story = parentId(task);
	assert.deepEqual(story, storyWorkflowId(EPIC_HASH, CREATED, 's1'));
	const epic = parentId(story!);
	assert.deepEqual(epic, epicWorkflowId(EPIC_HASH, CREATED));
	assert.equal(parentId(epic!), null);

	assert.equal(isTaskId(task), true);
	assert.equal(isStoryId(story!), true);
	assert.equal(isEpicId(epic!), true);
	assert.deepEqual(epicOf(task), epicWorkflowId(EPIC_HASH, CREATED));
});

// ---------------------------------------------------------------------------
// id — label bridges
// ---------------------------------------------------------------------------

test('label ↔ ordinal bridges', () => {
	assert.equal(storyIdToOrdinal('s1'), 1);
	assert.equal(ordinalToStoryId(1), 's1');
	assert.equal(taskIdToOrdinal('t3'), 3);
	assert.equal(ordinalToTaskId(3), 't3');
	assert.equal(storyWorkflowId(EPIC_HASH, CREATED, 's1').story, 1);
	assert.throws(() => storyIdToOrdinal('x1'));
	assert.throws(() => taskIdToOrdinal('s1'));
});

// ---------------------------------------------------------------------------
// resolver — fixture artifacts
// ---------------------------------------------------------------------------

const TASK_T3: PlanTask = {
	id: 't3', title: 'Wire the resolver', summary: 'Bridge all id forms.', size: 'M', order: 3,
	dependsOn: [], acceptanceChecks: ['resolves'], derivedFrom: ['c1'],
	tests: [{ level: 'unit', name: 'unit: resolves' }],
};

function writeJson(path: string, obj: unknown): void {
	mkdirSync(dirname(path), { recursive: true });
	writeFileSync(path, JSON.stringify(obj, null, 2) + '\n');
}

/** A one-epic artifacts dir: DEF (epicRef), LLD s1 (storyRef), PLAN s1
 *  (taskRefs t3 → #9). */
function setupRepo(): { repo: string; cleanup: () => void } {
	const repo = mkdtempSync(join(tmpdir(), 'insrc-resolve-'));
	const dir = join(repo, '.insrc/artifacts');
	writeJson(join(dir, `DEF-${EPIC_HASH}.json`), {
		meta: {
			workflow: 'define', runId: 'd1', repoPath: repo, epicHash: EPIC_HASH, epicSlug: 'demo-feature',
			createdAt: CREATED, schemaVersion: 1,
			tracker: { adapter: 'github', epicRef: 'acme/demo#1', storyRefs: { s1: 'acme/demo#5' } },
		},
		body: { flavor: 'new-capability', problem: 'x.', nonGoals: [], assumptions: [], constraints: [], stories: [], openQuestions: [] },
		citations: [],
	});
	writeJson(join(dir, `LLD-${EPIC_HASH}-s1.json`), {
		meta: {
			workflow: 'design.story', runId: 'l1', repoPath: repo, epicHash: EPIC_HASH, epicSlug: 'demo-feature',
			storyId: 's1', createdAt: CREATED, schemaVersion: 1,
			tracker: { adapter: 'github', storyRef: 'acme/demo#5' },
		},
		body: {},
	});
	writeJson(join(dir, `PLAN-${EPIC_HASH}-s1.json`), {
		meta: {
			workflow: 'plan', runId: 'p1', repoPath: repo, epicHash: EPIC_HASH, epicSlug: 'demo-feature',
			storyId: 's1', createdAt: CREATED, schemaVersion: 1,
			tracker: { adapter: 'github', taskRefs: { t3: 'acme/demo#9' } },
		},
		body: { tasks: [TASK_T3], testStrategyCoverage: [] },
		citations: [],
	});
	return { repo, cleanup: () => rmSync(repo, { recursive: true, force: true }) };
}

test('resolver — #9, s1/t3, canonical + slug all resolve to the same task record', () => {
	const s = setupRepo();
	try {
		const forms = ['#9', '9', 'acme/demo#9', 's1/t3', CANON_TASK, SLUG_TASK];
		const recs = forms.map(f => resolveWorkflowRef(s.repo, f));
		for (let i = 0; i < forms.length; i += 1) {
			assert.notEqual(recs[i], null, `form '${forms[i]}' resolved to null`);
		}
		const [first, ...rest] = recs;
		for (let i = 0; i < rest.length; i += 1) {
			assert.deepEqual(rest[i], first, `form '${forms[i + 1]}' differs from '${forms[0]}'`);
		}
		assert.deepEqual(first, {
			level: 'task', epicHash: EPIC_HASH, epicSlug: 'demo-feature', createdAt: CREATED,
			storyId: 's1', taskId: 't3', workflowId: CANON_TASK, slug: SLUG_TASK,
			issueRef: 'acme/demo#9', storyRef: 'acme/demo#5', epicRef: 'acme/demo#1', task: TASK_T3,
		});
	} finally { s.cleanup(); }
});

test('resolver — story-level (s1, #5) and epic-level (#1)', () => {
	const s = setupRepo();
	try {
		const story = resolveWorkflowRef(s.repo, 's1');
		assert.equal(story?.level, 'story');
		assert.equal(story?.workflowId, 'E20260717185807ba:S001');
		assert.equal(story?.issueRef, 'acme/demo#5');
		assert.equal(story?.taskId, undefined);

		const byStoryIssue = resolveWorkflowRef(s.repo, '#5');
		assert.deepEqual(byStoryIssue, story);

		const epic = resolveWorkflowRef(s.repo, '#1');
		assert.equal(epic?.level, 'epic');
		assert.equal(epic?.workflowId, 'E20260717185807ba');
		assert.equal(epic?.issueRef, 'acme/demo#1');
	} finally { s.cleanup(); }
});

test('resolver — both-way helpers', () => {
	const s = setupRepo();
	try {
		assert.equal(workflowIdForIssue(s.repo, 9), CANON_TASK);
		assert.equal(workflowIdForIssue(s.repo, '5'), 'E20260717185807ba:S001');
		assert.equal(issueForWorkflowId(s.repo, CANON_TASK), 'acme/demo#9');
		assert.equal(issueForWorkflowId(s.repo, SLUG_TASK), 'acme/demo#9');
		assert.equal(issueForWorkflowId(s.repo, 'E20260717185807ba:S001'), 'acme/demo#5');
		assert.equal(workflowIdForIssue(s.repo, 999), null);
	} finally { s.cleanup(); }
});

test('resolver — label is ambiguous in a multi-epic dir', () => {
	const s = setupRepo();
	try {
		// Add a second epic → label `s1/t3` can no longer be scoped.
		const other = 'aaaaaaaa11112222';
		writeJson(join(s.repo, '.insrc/artifacts', `DEF-${other}.json`), {
			meta: { workflow: 'define', runId: 'd2', repoPath: s.repo, epicHash: other, epicSlug: 'other', createdAt: CREATED, schemaVersion: 1 },
			body: { flavor: 'new-capability', problem: 'y.', nonGoals: [], assumptions: [], constraints: [], stories: [], openQuestions: [] },
			citations: [],
		});
		assert.equal(resolveWorkflowRef(s.repo, 's1/t3'), null);       // ambiguous
		// But the issue# + hierId (epic-scoped) still resolve.
		assert.equal(resolveWorkflowRef(s.repo, '#9')?.taskId, 't3');
		assert.equal(resolveWorkflowRef(s.repo, CANON_TASK)?.taskId, 't3');
	} finally { s.cleanup(); }
});

test('resolver — unknown / malformed identifier → null', () => {
	const s = setupRepo();
	try {
		assert.equal(resolveWorkflowRef(s.repo, 'garbage'), null);
		assert.equal(resolveWorkflowRef(s.repo, ''), null);
		assert.equal(resolveWorkflowRef(s.repo, '#404'), null);
	} finally { s.cleanup(); }
});

// ---------------------------------------------------------------------------
// marker embed + extract round-trip
// ---------------------------------------------------------------------------

test('id marker embeds as the first body line and round-trips out', () => {
	const body = renderTaskBody('acme/demo#5', 's1', TASK_T3, 'demo-feature', { owner: 'acme', repo: 'demo' }, CANON_TASK);
	assert.equal(body.split('\n')[0], `<!-- insrc:id ${CANON_TASK} -->`);
	assert.equal(parseIdMarker(body), CANON_TASK);
	// Without a workflowId the marker is absent.
	const bare = renderTaskBody('acme/demo#5', 's1', TASK_T3, 'demo-feature');
	assert.equal(parseIdMarker(bare), null);
});
