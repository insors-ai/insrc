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
	deriveWorkItemIdentity,
	type WorkflowId,
} from '../id.js';
import {
	resolveWorkflowRef, workflowIdForIssue, issueForWorkflowId,
	readEpicDefinition,
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
// S001 — uniform work-item identity: storyIdToOrdinal accepts both cases +
// the deriveWorkItemIdentity bundle. Standalone stories (uppercase 'S001')
// must canonicalize identically to their epic-parented lowercase sibling,
// with no regression for the already-canonicalizing lowercase class.
// ---------------------------------------------------------------------------

test('S001: storyIdToOrdinal accepts s<n> AND S<nnn> — case + padding inert', () => {
	// 's1', 'S1' and 'S001' all denote ordinal 1.
	assert.equal(storyIdToOrdinal('s1'), 1);
	assert.equal(storyIdToOrdinal('S1'), 1);
	assert.equal(storyIdToOrdinal('S001'), 1);
	// leading zeros are inert at any ordinal
	assert.equal(storyIdToOrdinal('S010'), 10);
	assert.equal(storyIdToOrdinal('s10'), 10);
	// a genuinely bad id still throws the identical Error (widening is additive)
	assert.throws(() => storyIdToOrdinal('story-1'), /invalid storyId 'story-1' \(expected s<n>\)/);
	assert.throws(() => storyIdToOrdinal(''), /expected s<n>/);
	assert.throws(() => storyIdToOrdinal('x1'), /expected s<n>/);
});

test('S001/ac1: a standalone uppercase S001 canonicalizes to the same id as its lowercase sibling', () => {
	const upper = toCanonical(storyWorkflowId(EPIC_HASH, CREATED, 'S001'));
	const lower = toCanonical(storyWorkflowId(EPIC_HASH, CREATED, 's1'));
	assert.equal(upper, 'E20260717185807ba:S001');
	assert.equal(upper, lower);            // identical to the epic-parented sibling
	assert.equal(toSlug(storyWorkflowId(EPIC_HASH, CREATED, 'S001')), 'E20260717185807ba-S001');
});

test('S001/ac2: lowercase story ids are byte-identical before/after; ordinalToStoryId unchanged', () => {
	// no-regression: 's10' still ordinal 10, canonical S010, slug -S010
	const s10 = storyWorkflowId(EPIC_HASH, CREATED, 's10');
	assert.equal(s10.story, 10);
	assert.equal(toCanonical(s10), 'E20260717185807ba:S010');
	assert.equal(toSlug(s10), 'E20260717185807ba-S010');
	// ordinalToStoryId is deliberately NOT changed — still lowercase 's<n>'
	// (tracker/resolve.ts reconstruction depends on this form).
	assert.equal(ordinalToStoryId(1), 's1');
	assert.equal(ordinalToStoryId(10), 's10');
});

test('S001: deriveWorkItemIdentity composes the bundle; story-level s1===S001; epic-level has no story segment', () => {
	const fromUpper = deriveWorkItemIdentity(EPIC_HASH, CREATED, 'S001');
	const fromLower = deriveWorkItemIdentity(EPIC_HASH, CREATED, 's1');
	assert.deepEqual(fromUpper, fromLower);   // case does not affect identity
	assert.deepEqual(fromUpper, {
		canonical:   'E20260717185807ba:S001',
		slug:        'E20260717185807ba-S001',
		epicSegment: 'E20260717185807ba',
		story:       1,
	});
	// epic-level (storyId omitted): no :S segment, story undefined
	const epic = deriveWorkItemIdentity(EPIC_HASH, CREATED);
	assert.deepEqual(epic, {
		canonical:   'E20260717185807ba',
		slug:        'E20260717185807ba',
		epicSegment: 'E20260717185807ba',
	});
	assert.equal(epic.story, undefined);
	// a bad storyId propagates the storyIdToOrdinal throw (no swallow)
	assert.throws(() => deriveWorkItemIdentity(EPIC_HASH, CREATED, 'bad'), /expected s<n>/);
});

test('S001/lc1: identity stays both-way — parse(toCanonical(mint(S001))) yields ordinal 1', () => {
	const round = parseWorkflowId(toCanonical(storyWorkflowId(EPIC_HASH, CREATED, 'S001')));
	assert.equal(round?.story, 1);
	assert.equal(round?.level, 'story');
	assert.deepEqual(round, storyWorkflowId(EPIC_HASH, CREATED, 's1'));
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

// ---------------------------------------------------------------------------
// resolver — a bugfix chain writes no DEF: the ISSUE artifact is the anchor
// ---------------------------------------------------------------------------

const BUG_HASH = 'de2b586f80943e39';
const TASK_T1: PlanTask = {
	id: 't1', title: 'Characterise the defect', summary: 'Baseline first.', size: 'M', order: 1,
	dependsOn: [], acceptanceChecks: ['reproduces'], derivedFrom: ['c1'],
	tests: [{ level: 'integration', name: 'integration: reproduces' }],
};

/** A bugfix-chain artifacts dir: ISSUE (no DEF) + LLD/PLAN named with the
 *  UPPERCASE `S001` story id the standalone route mints. */
function setupBugfixRepo(opts: { withIssue?: boolean } = {}): { repo: string; dir: string; cleanup: () => void } {
	const repo = mkdtempSync(join(tmpdir(), 'insrc-resolve-bug-'));
	const dir = join(repo, '.insrc/artifacts');
	if (opts.withIssue !== false) {
		writeJson(join(dir, `ISSUE-${BUG_HASH}.json`), {
			meta: {
				workflow: 'issue', runId: 'i1', repoPath: repo, issueHash: BUG_HASH,
				epicSlug: 'resolver-blocked', createdAt: CREATED, standalone: true,
				magnitude: 'sized', schemaVersion: 1,
			},
			body: { title: 'x', reproduction: 'x', rootCause: 'x', fixIntent: 'x' },
			citations: [],
		});
	}
	writeJson(join(dir, `LLD-${BUG_HASH}-S001.json`), {
		meta: {
			workflow: 'design.story', runId: 'l1', repoPath: repo, epicHash: BUG_HASH,
			epicSlug: 'resolver-blocked', storyId: 'S001', createdAt: CREATED, schemaVersion: 1,
			tracker: { adapter: 'github', storyRef: 'acme/demo#77' },
		},
		body: {},
	});
	writeJson(join(dir, `PLAN-${BUG_HASH}-S001.json`), {
		meta: {
			workflow: 'plan', runId: 'p1', repoPath: repo, epicHash: BUG_HASH,
			epicSlug: 'resolver-blocked', storyId: 'S001', createdAt: CREATED, schemaVersion: 1,
			tracker: { adapter: 'github', taskRefs: { t1: 'acme/demo#78' } },
		},
		body: { tasks: [TASK_T1], testStrategyCoverage: [] },
		citations: [],
	});
	return { repo, dir, cleanup: () => rmSync(repo, { recursive: true, force: true }) };
}

test("resolver — a DEF-less bugfix epic resolves 'S001/t1' to its PlanTask (was null: unresolved-target)", () => {
	const s = setupBugfixRepo();
	try {
		const r = resolveWorkflowRef(s.repo, 'S001/t1', { epicHash: BUG_HASH });
		assert.notEqual(r, null, "'S001/t1' must resolve from the ISSUE anchor when no DEF exists");
		assert.equal(r!.level, 'task');
		assert.equal(r!.storyId, 'S001');
		assert.equal(r!.taskId, 't1');
		assert.equal(r!.epicSlug, 'resolver-blocked', 'epicSlug comes off the ISSUE meta');
		assert.equal(r!.createdAt, CREATED, 'createdAt comes off the ISSUE meta');
		// The PlanTask itself must be attached — a ref without it is rejected
		// downstream by resolveTaskRef as "resolved to a task, not a task".
		assert.equal(r!.task?.id, 't1');
		assert.equal(r!.task?.title, 'Characterise the defect');
	} finally { s.cleanup(); }
});

test('resolver — MUTATION: delete the ISSUE and the same target goes back to null', () => {
	const s = setupBugfixRepo({ withIssue: false });
	try {
		assert.equal(
			resolveWorkflowRef(s.repo, 'S001/t1', { epicHash: BUG_HASH }), null,
			'with neither DEF nor ISSUE the epic is unaddressable — proving the ISSUE anchor is what makes the positive case pass',
		);
	} finally { s.cleanup(); }
});

test('resolver — an uppercase S001 story is resolvable by ISSUE NUMBER (the lowercase-only PLAN_RE/LLD_RE defect)', () => {
	const s = setupBugfixRepo();
	try {
		assert.equal(resolveWorkflowRef(s.repo, '#78')?.taskId, 't1', 'taskRefs under a PLAN-<hash>-S001.json must be scanned');
		assert.equal(resolveWorkflowRef(s.repo, '#78')?.storyId, 'S001');
		assert.equal(resolveWorkflowRef(s.repo, '#77')?.level, 'story', 'storyRef under an LLD-<hash>-S001.json must be scanned');
	} finally { s.cleanup(); }
});

test('resolver — the hierarchical id form also resolves for a DEF-less epic', () => {
	const s = setupBugfixRepo();
	try {
		const byLabel = resolveWorkflowRef(s.repo, 'S001/t1', { epicHash: BUG_HASH });
		assert.notEqual(byLabel, null);
		const byHier = resolveWorkflowRef(s.repo, byLabel!.workflowId);
		assert.notEqual(byHier, null, 'the canonical id must resolve too — it shares the DEF-only enumeration gate, and its date match read the DEF directly');
		assert.equal(byHier!.taskId, 't1');
		// The PlanTask must be attached even though the hier form yields the
		// LOWERCASE label while the artifacts on disk are named `-S001.json`.
		assert.equal(byHier!.task?.id, 't1', 'the story artifact must be found across the two story-id spellings');
		// NOTE the spelling: a hierarchical id denotes a story by ORDINAL, and
		// ordinalToStoryId renders ordinal 1 as `s1`. So the resolved ref reports
		// `s1` here and `S001` via the label form — same node, two spellings.
		assert.equal(byHier!.storyId, 's1');
		assert.equal(storyIdToOrdinal(byHier!.storyId!), storyIdToOrdinal('S001'), 'both spellings denote the same story ordinal');
		// And the slug form resolves identically.
		assert.equal(resolveWorkflowRef(s.repo, byLabel!.slug)?.taskId, 't1');
	} finally { s.cleanup(); }
});

test('resolver — ADDITIVE: when BOTH a DEF and an ISSUE exist for one hash, the DEF wins and nothing is guessed', () => {
	const s = setupBugfixRepo();
	try {
		// Same hash, both anchors present, different slugs so the winner is visible.
		writeJson(join(s.dir, `DEF-${BUG_HASH}.json`), {
			meta: {
				workflow: 'define', runId: 'd1', repoPath: s.repo, epicHash: BUG_HASH,
				epicSlug: 'def-wins', createdAt: CREATED, schemaVersion: 1,
			},
			body: { flavor: 'new-capability', problem: 'x.', nonGoals: [], assumptions: [], constraints: [], stories: [], openQuestions: [] },
			citations: [],
		});
		const r = resolveWorkflowRef(s.repo, 'S001/t1', { epicHash: BUG_HASH });
		assert.notEqual(r, null);
		assert.equal(r!.epicSlug, 'def-wins', 'the DEF is consulted first and wins outright — the ISSUE is a fallback, not a competitor');
		// The hash must be enumerated ONCE despite matching both the DEF and the
		// ISSUE pattern. If it were double-counted, this single-epic dir would
		// look like two epics and an UNSCOPED label would turn ambiguous.
		const unscoped = resolveWorkflowRef(s.repo, 'S001/t1');
		assert.notEqual(unscoped, null, 'one epic with two anchors must enumerate once, not become a false multi-epic');
		assert.equal(unscoped!.epicSlug, 'def-wins');
	} finally { s.cleanup(); }
});

test('resolver — a DEF-bearing epic is untouched by the ISSUE fallback (regression)', () => {
	const s = setupRepo();
	try {
		const r = resolveWorkflowRef(s.repo, 's1/t3');
		assert.notEqual(r, null);
		assert.equal(r!.epicSlug, 'demo-feature');
		assert.equal(r!.taskId, 't3');
		assert.equal(r!.task?.title, 'Wire the resolver');
		assert.equal(r!.issueRef, 'acme/demo#9', 'tracker refs still resolve off the DEF path');
	} finally { s.cleanup(); }
});

test('resolver — a DEF-less bugfix epic still counts for multi-epic ambiguity (refuses to guess)', () => {
	const s = setupBugfixRepo();
	try {
		// A SECOND epic, DEF-anchored. An unscoped label must now refuse.
		writeJson(join(s.dir, `DEF-${EPIC_HASH}.json`), {
			meta: {
				workflow: 'define', runId: 'd2', repoPath: s.repo, epicHash: EPIC_HASH,
				epicSlug: 'other', createdAt: CREATED, schemaVersion: 1,
			},
			body: { flavor: 'new-capability', problem: 'y.', nonGoals: [], assumptions: [], constraints: [], stories: [], openQuestions: [] },
			citations: [],
		});
		assert.equal(
			resolveWorkflowRef(s.repo, 'S001/t1'), null,
			'two epics present (one ISSUE-anchored, one DEF-anchored) → an unscoped label is ambiguous and must NOT guess',
		);
		// Scoping by hash disambiguates, as it does for DEF epics.
		assert.equal(resolveWorkflowRef(s.repo, 'S001/t1', { epicHash: BUG_HASH })?.taskId, 't1');
	} finally { s.cleanup(); }
});

// ---------------------------------------------------------------------------
// S001/t1 — RED-FIRST ACCEPTANCE TESTS for ISSUE-792f9324fc43d95c
//
// READ THE NEXT PARAGRAPH BEFORE EDITING ANY OF THESE.
//
// These are NOT characterisations. The immediately-preceding Story
// (ISSUE-93081bff91ae5108) used "characterisation" for a test that PASSES while
// asserting today's WRONG behaviour and is INVERTED by a named later task. These
// five do the opposite: each asserts the DESIRED behaviour and therefore FAILS on
// unmodified HEAD. Rewriting any of them to pass today would assert the defect as
// desired — which is exactly the mis-asserted test that blocked this Story's
// first LLD review.
//
// Each names the task that turns it green:
//   (a) mirror direction of the reported defect        → green at t4
//   (b) nonexistent story in a single-epic repo        → green at t3
//   (c) scoped label for a missing story  [NARROWING 1] → green at t3
//   (d) hierarchical id, nonexistent ordinal [NARROWING 2] → green at t3
//   (e) two feature epics, only one holds the label    → green at t4
//
// DELIBERATELY ABSENT: a test for the arrangement at the "DEF-less bugfix epic
// still counts for multi-epic ambiguity" test ABOVE (:459). That arrangement is
// ALREADY covered there, asserting the regressed expectation, and t5 INVERTS it.
// Adding one here would duplicate it.
//
// FOUR TESTS ENCODE TODAY'S BEHAVIOUR AND MUST BE INVERTED AT t5 — the approved
// plan named only three, so this list is the corrected one. The fourth was found
// by the t1 build-validation gate's static reading:
//   1. :459 'a DEF-less bugfix epic still counts for multi-epic ambiguity'
//   2. :447 'a DEF-bearing epic is untouched by the ISSUE fallback (regression)'
//          — fixture has NO ISSUE file, so it protects nothing today
//   3. tracker.test.ts:283 multi-epic arm — restate in containment terms
//   4. :302 'label is ambiguous in a multi-epic dir' — MISSED BY THE PLAN. It is
//          the same arrangement as (e) below: setupRepo plus a second DEF epic
//          holding no s1, asserting `s1/t3` is null. t4 turns it RED, so t5 must
//          invert its FIRST assertion. Its issue-number and hierarchical-id arms
//          stay valid and must be KEPT.
// ---------------------------------------------------------------------------

/** A second, unrelated epic anchored by an ISSUE on a DIFFERENT hash — the
 *  bugfix whose mere presence must stop shadowing another epic's labels. */
const OTHER_BUG_HASH = 'aaaa1111bbbb2222';
/** A second, unrelated epic anchored by a DEF on a DIFFERENT hash, holding NO s1. */
const OTHER_EPIC_HASH = 'cccc3333dddd4444';

function addUnrelatedIssueEpic(repo: string): void {
	writeJson(join(repo, '.insrc/artifacts', `ISSUE-${OTHER_BUG_HASH}.json`), {
		meta: {
			workflow: 'issue', runId: 'i9', repoPath: repo, issueHash: OTHER_BUG_HASH,
			epicSlug: 'an-unrelated-bugfix', createdAt: CREATED, standalone: true,
			magnitude: 'small', schemaVersion: 1,
		},
		body: { title: 'unrelated', reproduction: 'x', rootCause: 'x', fixIntent: 'x' },
		citations: [],
	});
}

function addUnrelatedDefEpicWithoutS1(repo: string): void {
	writeJson(join(repo, '.insrc/artifacts', `DEF-${OTHER_EPIC_HASH}.json`), {
		meta: {
			workflow: 'define', runId: 'd9', repoPath: repo, epicHash: OTHER_EPIC_HASH,
			epicSlug: 'other-feature', createdAt: CREATED, schemaVersion: 1,
		},
		// No stories declared and no LLD/PLAN written — this epic does NOT contain s1.
		body: { flavor: 'new-capability', problem: 'y.', nonGoals: [], assumptions: [], constraints: [], stories: [], openQuestions: [] },
		citations: [],
	});
}

test('RED-FIRST (a), green at t4 — asserts DESIRED behaviour, FAILS today: a DEF epic holding s1 plus an UNRELATED ISSUE epic on a different hash still resolves `s1`', () => {
	const s = setupRepo();
	try {
		addUnrelatedIssueEpic(s.repo);
		const r = resolveWorkflowRef(s.repo, 's1');
		assert.notEqual(r, null,
			'filing an unrelated bugfix must not shadow a label it has nothing to do with — exactly one epic contains s1');
		assert.equal(r!.epicHash, EPIC_HASH, 'and it resolves to the epic that actually holds the story');
		assert.equal(r!.storyId, 's1');
	} finally { s.cleanup(); }
});

test('RED-FIRST (b), green at t3 — asserts DESIRED behaviour, FAILS today: a single-epic repo REFUSES a nonexistent story instead of minting a dummy ref', () => {
	const s = setupRepo();
	try {
		assert.notEqual(resolveWorkflowRef(s.repo, 's1'), null, 'precondition: the real story resolves');
		assert.equal(resolveWorkflowRef(s.repo, 's9'), null,
			'no s9 exists in this epic — today buildRef mints a well-formed reference to a story nobody created');
	} finally { s.cleanup(); }
});

test('RED-FIRST (c), green at t3, NARROWING 1 — asserts DESIRED behaviour, FAILS today: an explicitly scoped label for a story the scoped epic LACKS refuses', () => {
	const s = setupRepo();
	try {
		assert.notEqual(resolveWorkflowRef(s.repo, 's1', { epicHash: EPIC_HASH }), null,
			'precondition: the scoped path resolves a story that exists');
		assert.equal(resolveWorkflowRef(s.repo, 's9', { epicHash: EPIC_HASH }), null,
			'supplying a scope asserts WHICH epic, not that the story exists — no trusted-caller exemption');
	} finally { s.cleanup(); }
});

test('RED-FIRST (d), green at t3, NARROWING 2 — asserts DESIRED behaviour, FAILS today: a hierarchical id naming a nonexistent story ordinal refuses', () => {
	const s = setupRepo();
	try {
		assert.notEqual(resolveWorkflowRef(s.repo, 'E20260717185807ba:S001'), null,
			'precondition: the hierarchical form resolves a story that exists');
		assert.equal(resolveWorkflowRef(s.repo, 'E20260717185807ba:S009'), null,
			'a hierarchical id derives its ordinal from the id and never confirmed it — S009 does not exist');
	} finally { s.cleanup(); }
});

test('RED-FIRST (e), green at t4 — asserts DESIRED behaviour, FAILS today: two FEATURE epics where only ONE holds s1 resolves (additive beyond the regression)', () => {
	const s = setupRepo();
	try {
		addUnrelatedDefEpicWithoutS1(s.repo);
		const r = resolveWorkflowRef(s.repo, 's1');
		assert.notEqual(r, null,
			'only one epic contains s1, so the label is unambiguous in fact — the old count rule refused here even before 13ebd04');
		assert.equal(r!.epicHash, EPIC_HASH);
	} finally { s.cleanup(); }
});

// ---------------------------------------------------------------------------
// S001/t2 — readEpicDefinition: the definition-artifact reader, UNWIRED.
//
// An ISSUE **is** a DEF, so both kinds answer the same question and the READ
// ORDER is the only discriminator. These tests pin that order, the
// first-READABLE-wins consequence, and the never-throws contract. Nothing in
// production calls this reader yet — t3 wires it into buildRef.
// ---------------------------------------------------------------------------

test('t2: readEpicDefinition reads the DEF first and the ISSUE second — the order is the discriminator', () => {
	const s = setupRepo();
	try {
		const dir = join(s.repo, '.insrc/artifacts');

		// DEF present → kind 'def', and the body it returns is the DEF's.
		const def = readEpicDefinition(dir, EPIC_HASH);
		assert.notEqual(def, null);
		assert.equal(def!.kind, 'def');
		assert.equal(def!.artifact.meta?.epicSlug, 'demo-feature');

		// Only an ISSUE present → kind 'issue'. Reaching the second read IS what
		// makes this epic ISSUE-anchored; no field is consulted to decide it.
		addUnrelatedIssueEpic(s.repo);
		const iss = readEpicDefinition(dir, OTHER_BUG_HASH);
		assert.notEqual(iss, null);
		assert.equal(iss!.kind, 'issue');
		assert.equal(iss!.artifact.meta?.epicSlug, 'an-unrelated-bugfix');

		// BOTH present on ONE hash — the only arrangement in which the ORDER is
		// observable. Without this the order assertion is vacuous: reversing the
		// reads changes nothing when each hash carries a single artifact.
		const dual = '9999aaaa8888bbbb';
		writeJson(join(dir, `DEF-${dual}.json`), {
			meta: {
				workflow: 'define', runId: 'dd', repoPath: s.repo, epicHash: dual,
				epicSlug: 'def-wins', createdAt: CREATED, schemaVersion: 1,
			},
			body: { flavor: 'new-capability', problem: 'z.', nonGoals: [], assumptions: [], constraints: [], stories: [], openQuestions: [] },
			citations: [],
		});
		writeJson(join(dir, `ISSUE-${dual}.json`), {
			meta: {
				workflow: 'issue', runId: 'ii', repoPath: s.repo, issueHash: dual,
				epicSlug: 'issue-loses', createdAt: CREATED, standalone: true, schemaVersion: 1,
			},
			body: { title: 'x', reproduction: 'x', rootCause: 'x', fixIntent: 'x' },
			citations: [],
		});
		const both = readEpicDefinition(dir, dual);
		assert.equal(both!.kind, 'def', 'DEF is read FIRST and wins outright when both anchors exist');
		assert.equal(both!.artifact.meta?.epicSlug, 'def-wins',
			'and the returned artifact is the DEF\'s, not the ISSUE\'s — mirroring readEpicIdentity');

		// Neither present → absence, not a throw.
		assert.equal(readEpicDefinition(dir, 'ffffffffffffffff'), null);
	} finally { s.cleanup(); }
});

test('t2: first-READABLE-wins — a MALFORMED DEF falls through to the ISSUE rather than aborting the read', () => {
	const s = setupRepo();
	try {
		const dir = join(s.repo, '.insrc/artifacts');
		const hash = 'eeee5555ffff6666';
		// A DEF that exists but cannot be parsed, plus a readable ISSUE on the SAME hash.
		writeFileSync(join(dir, `DEF-${hash}.json`), '{ this is not json');
		writeJson(join(dir, `ISSUE-${hash}.json`), {
			meta: {
				workflow: 'issue', runId: 'i2', repoPath: s.repo, issueHash: hash,
				epicSlug: 'fallback-target', createdAt: CREATED, standalone: true, schemaVersion: 1,
			},
			body: { title: 'x', reproduction: 'x', rootCause: 'x', fixIntent: 'x' },
			citations: [],
		});

		const got = readEpicDefinition(dir, hash);
		assert.notEqual(got, null, 'a corrupt DEF must not abort the read');
		assert.equal(got!.kind, 'issue', 'it falls through to the ISSUE — first-READABLE-wins, not first-PRESENT-wins');
		assert.equal(got!.artifact.meta?.epicSlug, 'fallback-target');
	} finally { s.cleanup(); }
});

test('t2: readEpicDefinition NEVER throws — missing, malformed, and a malformed-with-no-fallback all yield an absence', () => {
	const s = setupRepo();
	try {
		const dir = join(s.repo, '.insrc/artifacts');
		// Missing entirely.
		assert.doesNotThrow(() => readEpicDefinition(dir, 'dddddddddddddddd'));
		// Malformed DEF with NO ISSUE behind it — both reads fail, still no throw.
		const lone = 'bbbb7777cccc8888';
		writeFileSync(join(dir, `DEF-${lone}.json`), 'not json at all');
		assert.doesNotThrow(() => readEpicDefinition(dir, lone));
		assert.equal(readEpicDefinition(dir, lone), null, 'both reads unusable → absence');
		// A nonexistent directory must not throw either.
		assert.doesNotThrow(() => readEpicDefinition(join(s.repo, 'no-such-dir'), EPIC_HASH));
		assert.equal(readEpicDefinition(join(s.repo, 'no-such-dir'), EPIC_HASH), null);
	} finally { s.cleanup(); }
});

test('t3: the reader is now WIRED — the DEF body type carries `stories`, and an undeclared story no longer resolves', () => {
	const s = setupRepo();
	try {
		const dir = join(s.repo, '.insrc/artifacts');
		// `stories` is part of the narrow body shape (setupRepo declares none).
		const def = readEpicDefinition(dir, EPIC_HASH);
		assert.deepEqual(def!.artifact.body?.stories, [], 'the DEF fixture declares an empty story list, and the type can now see it');

		// INVERTED at t3 (was the t2 behaviour-unchanged guard). t2 added the
		// reader but called it from nowhere, so `s9` still produced a dummy ref;
		// t3 consumes it from buildRef, so the undeclared story now refuses.
		assert.notEqual(resolveWorkflowRef(s.repo, 's1'), null, 'the real story — an LLD exists — still resolves');
		assert.equal(resolveWorkflowRef(s.repo, 's9'), null,
			'no dummy ref: s9 has neither a story-scoped artifact nor a declaration on the DEF');
	} finally { s.cleanup(); }
});

// ---------------------------------------------------------------------------
// S001/t3 — story existence is VERIFIED inside buildRef (the dummy-ref fix)
// ---------------------------------------------------------------------------

const DECL_HASH = 'eeee5555ffff6666';

/** A single-epic repo whose DEF DECLARES s1 and s2 but ships a story-scoped
 *  artifact only for s1 — so the two existence clauses can be told apart. */
function setupDeclaredStoryRepo(): { repo: string; dir: string; cleanup: () => void } {
	const repo = mkdtempSync(join(tmpdir(), 'insrc-resolve-decl-'));
	const dir = join(repo, '.insrc/artifacts');
	writeJson(join(dir, `DEF-${DECL_HASH}.json`), {
		meta: {
			workflow: 'define', runId: 'd1', repoPath: repo, epicHash: DECL_HASH,
			epicSlug: 'declared-stories', createdAt: CREATED, schemaVersion: 1,
		},
		body: {
			flavor: 'new-capability', problem: 'x.', nonGoals: [], assumptions: [], constraints: [],
			stories: [
				{ id: 's1', title: 'one', userValue: 'x', acceptanceCriteria: [] },
				{ id: 's2', title: 'two', userValue: 'x', acceptanceCriteria: [] },
			],
			openQuestions: [],
		},
		citations: [],
	});
	writeJson(join(dir, `LLD-${DECL_HASH}-s1.json`), {
		meta: {
			workflow: 'design.story', runId: 'l1', repoPath: repo, epicHash: DECL_HASH,
			epicSlug: 'declared-stories', storyId: 's1', createdAt: CREATED, schemaVersion: 1,
		},
		body: {},
	});
	return { repo, dir, cleanup: () => rmSync(repo, { recursive: true, force: true }) };
}

test('t3 — the ARTIFACT clause: a story with an LLD resolves, and one with only a PLAN resolves too', () => {
	const s = setupRepo();
	try {
		// setupRepo ships both an LLD and a PLAN for s1.
		assert.notEqual(resolveWorkflowRef(s.repo, 's1'), null, 'LLD + PLAN present → resolves');

		// A PLAN alone is sufficient: drop the LLD and the story still exists.
		rmSync(join(s.repo, '.insrc/artifacts', `LLD-${EPIC_HASH}-s1.json`));
		assert.notEqual(resolveWorkflowRef(s.repo, 's1'), null, 'PLAN alone is still an existing story');
	} finally { s.cleanup(); }
});

test('t3 — neither artifact nor declaration → REFUSAL, not a dummy ref', () => {
	const s = setupRepo();
	try {
		// setupRepo's DEF declares `stories: []`, so s9 has no basis at all.
		assert.equal(resolveWorkflowRef(s.repo, 's9'), null);
		assert.equal(resolveWorkflowRef(s.repo, 's9/t3'), null, 'the task level refuses with its story');
	} finally { s.cleanup(); }
});

test('t3 — the DECLARATION clause alone suffices: a DEF-declared story with no LLD and no PLAN resolves', () => {
	const s = setupDeclaredStoryRepo();
	try {
		const declaredOnly = resolveWorkflowRef(s.repo, 's2');
		assert.notEqual(declaredOnly, null, 's2 is declared in the DEF body.stories — the define-to-design window');
		assert.equal(declaredOnly!.level, 'story');
		assert.equal(declaredOnly!.storyId, 's2');

		assert.notEqual(resolveWorkflowRef(s.repo, 's1'), null, 's1 is both declared and has an LLD');
		assert.equal(resolveWorkflowRef(s.repo, 's3'), null, 's3 is neither declared nor built');
	} finally { s.cleanup(); }
});

test('t3 — an ISSUE-anchored epic blesses ordinal 1 and REFUSES ordinal 2 (the one-story convention)', () => {
	const repo = mkdtempSync(join(tmpdir(), 'insrc-resolve-bare-issue-'));
	const dir = join(repo, '.insrc/artifacts');
	try {
		// A just-approved bugfix: the ISSUE exists, nothing downstream does yet.
		writeJson(join(dir, `ISSUE-${BUG_HASH}.json`), {
			meta: {
				workflow: 'issue', runId: 'i1', repoPath: repo, issueHash: BUG_HASH,
				epicSlug: 'bare-issue', createdAt: CREATED, standalone: true,
				magnitude: 'small', schemaVersion: 1,
			},
			body: { title: 'x', reproduction: 'x', rootCause: 'x', fixIntent: 'x' },
			citations: [],
		});
		const first = resolveWorkflowRef(repo, 'S001');
		assert.notEqual(first, null, 'ordinal 1 is the standalone route’s single declared story');
		assert.equal(first!.storyId, 'S001');
		assert.equal(resolveWorkflowRef(repo, 'S002'), null, 'an ISSUE declares no second story');
	} finally { rmSync(repo, { recursive: true, force: true }); }
});

test('t3 — s1 / S1 / S001 verify identically, inherited from storyIdToOrdinal', () => {
	const s = setupBugfixRepo();
	try {
		// The artifacts are named `-S001`; every spelling of ordinal 1 must pass.
		for (const spelling of ['S001', 'S1', 's1']) {
			const r = resolveWorkflowRef(s.repo, spelling, { epicHash: BUG_HASH });
			assert.notEqual(r, null, `spelling '${spelling}' must verify against the S001 artifacts`);
		}
		// And every spelling of a nonexistent ordinal must refuse.
		for (const spelling of ['S002', 'S2', 's2']) {
			assert.equal(resolveWorkflowRef(s.repo, spelling, { epicHash: BUG_HASH }), null,
				`spelling '${spelling}' names ordinal 2, which does not exist`);
		}
	} finally { s.cleanup(); }
});

test('t3 — an EPIC-level call is entirely unverified and unchanged (asserted, not assumed)', () => {
	const s = setupRepo();
	try {
		const epic = resolveWorkflowRef(s.repo, '#1');
		assert.notEqual(epic, null);
		assert.equal(epic!.level, 'epic');
		assert.equal(epic!.storyId, undefined, 'no storyId → the verification gate never runs');

		// Even with every story-scoped artifact removed, the epic still resolves.
		rmSync(join(s.repo, '.insrc/artifacts', `LLD-${EPIC_HASH}-s1.json`));
		rmSync(join(s.repo, '.insrc/artifacts', `PLAN-${EPIC_HASH}-s1.json`));
		const bare = resolveWorkflowRef(s.repo, '#1');
		assert.notEqual(bare, null, 'epic-level resolution does not depend on any story existing');
		assert.equal(bare!.level, 'epic');
	} finally { s.cleanup(); }
});

test('t3 — task-level NON-extension: an existing story with an unknown taskId still resolves, `task` absent', () => {
	const s = setupRepo();
	try {
		const r = resolveWorkflowRef(s.repo, 's1/t99');
		assert.notEqual(r, null, 'the story exists, so the ref is minted — the task is not verified');
		assert.equal(r!.level, 'task');
		assert.equal(r!.taskId, 't99');
		assert.equal(r!.task, undefined, 'an unknown task leaves `task` absent, exactly as before t3');
	} finally { s.cleanup(); }
});

test('t3 — never throws: an unparseable story label and a malformed definition artifact each yield a refusal', () => {
	const s = setupRepo();
	try {
		for (const bad of ['s', 'sx', 's1x', 'sx/t3', 'S00x']) {
			assert.doesNotThrow(() => resolveWorkflowRef(s.repo, bad), `'${bad}' must not throw`);
			assert.equal(resolveWorkflowRef(s.repo, bad), null, `'${bad}' must refuse`);
		}
		// A definition artifact that is not JSON at all must also degrade quietly.
		const dir = join(s.repo, '.insrc/artifacts');
		writeFileSync(join(dir, `DEF-${EPIC_HASH}.json`), 'not json at all');
		assert.doesNotThrow(() => resolveWorkflowRef(s.repo, 's1'));
	} finally { s.cleanup(); }
});

test('t3 — PER-CLAUSE degradation: a corrupt DEF does not disqualify a story whose LLD is intact', () => {
	const repo = mkdtempSync(join(tmpdir(), 'insrc-resolve-degrade-'));
	const dir = join(repo, '.insrc/artifacts');
	try {
		// Identity must still be obtainable, so an ISSUE backs the corrupt DEF.
		// The ISSUE alone would bless ONLY ordinal 1 — yet s2 must resolve,
		// because its LLD exists and clause 1 is evaluated independently.
		mkdirSync(dir, { recursive: true });
		writeFileSync(join(dir, `DEF-${DECL_HASH}.json`), '{ this is not json');
		writeJson(join(dir, `ISSUE-${DECL_HASH}.json`), {
			meta: {
				workflow: 'issue', runId: 'i1', repoPath: repo, issueHash: DECL_HASH,
				epicSlug: 'degraded', createdAt: CREATED, standalone: true,
				magnitude: 'sized', schemaVersion: 1,
			},
			body: { title: 'x', reproduction: 'x', rootCause: 'x', fixIntent: 'x' },
			citations: [],
		});
		writeJson(join(dir, `LLD-${DECL_HASH}-s2.json`), {
			meta: {
				workflow: 'design.story', runId: 'l2', repoPath: repo, epicHash: DECL_HASH,
				epicSlug: 'degraded', storyId: 's2', createdAt: CREATED, schemaVersion: 1,
			},
			body: {},
		});
		const r = resolveWorkflowRef(repo, 's2');
		assert.notEqual(r, null, 'the intact LLD carries s2 despite an unreadable DEF and an ISSUE that blesses only ordinal 1');
		assert.equal(r!.storyId, 's2');
		// The inverse still holds: ordinal 3 has no artifact and no declaration.
		assert.equal(resolveWorkflowRef(repo, 's3'), null);
	} finally { rmSync(repo, { recursive: true, force: true }); }
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
	const body = renderTaskBody('acme/demo#5', 's1', TASK_T3, 'demo-feature', EPIC_HASH, CREATED, { owner: 'acme', repo: 'demo' }, CANON_TASK);
	assert.equal(body.split('\n')[0], `<!-- insrc:id ${CANON_TASK} -->`);
	assert.equal(parseIdMarker(body), CANON_TASK);
	// Without a workflowId the marker is absent.
	const bare = renderTaskBody('acme/demo#5', 's1', TASK_T3, 'demo-feature', EPIC_HASH, CREATED);
	assert.equal(parseIdMarker(bare), null);
});
