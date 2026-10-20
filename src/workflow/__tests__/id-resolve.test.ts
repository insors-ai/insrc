/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Integration tests for the tracker resolver (`workflow/tracker/resolve.ts`), plus the
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
// The artifact ids of the same nodes.
const EPIC_ID  = `EPIC-${EPIC_HASH}`;
const STORY_ID = `STORY-${EPIC_HASH}-s1`;
const TASK_ID  = `TASK-${EPIC_HASH}-s1-t3`;

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
			storyId: 's1', createdAt: CREATED, epicCreatedAt: CREATED, schemaVersion: 1,
			tracker: { adapter: 'github', storyRef: 'acme/demo#5' },
		},
		body: {},
	});
	writeJson(join(dir, `PLAN-${EPIC_HASH}-s1.json`), {
		meta: {
			workflow: 'plan', runId: 'p1', repoPath: repo, epicHash: EPIC_HASH, epicSlug: 'demo-feature',
			storyId: 's1', createdAt: CREATED, epicCreatedAt: CREATED, schemaVersion: 1,
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
		const forms = ['#9', '9', 'acme/demo#9', 's1/t3', TASK_ID, TASK_ID];
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
			storyId: 's1', taskId: 't3', workflowId: TASK_ID, slug: TASK_ID,
			issueRef: 'acme/demo#9', storyRef: 'acme/demo#5', epicRef: 'acme/demo#1', task: TASK_T3,
		});
	} finally { s.cleanup(); }
});

test('resolver — story-level (s1, #5) and epic-level (#1)', () => {
	const s = setupRepo();
	try {
		const story = resolveWorkflowRef(s.repo, 's1');
		assert.equal(story?.level, 'story');
		assert.equal(story?.workflowId, STORY_ID);
		assert.equal(story?.issueRef, 'acme/demo#5');
		assert.equal(story?.taskId, undefined);

		const byStoryIssue = resolveWorkflowRef(s.repo, '#5');
		assert.deepEqual(byStoryIssue, story);

		const epic = resolveWorkflowRef(s.repo, '#1');
		assert.equal(epic?.level, 'epic');
		assert.equal(epic?.workflowId, EPIC_ID);
		assert.equal(epic?.issueRef, 'acme/demo#1');
	} finally { s.cleanup(); }
});

test('resolver — both-way helpers', () => {
	const s = setupRepo();
	try {
		assert.equal(workflowIdForIssue(s.repo, 9), TASK_ID);
		assert.equal(workflowIdForIssue(s.repo, '5'), STORY_ID);
		assert.equal(issueForWorkflowId(s.repo, TASK_ID), 'acme/demo#9');
		assert.equal(issueForWorkflowId(s.repo, TASK_ID), 'acme/demo#9');
		assert.equal(issueForWorkflowId(s.repo, STORY_ID), 'acme/demo#5');
		assert.equal(workflowIdForIssue(s.repo, 999), null);
	} finally { s.cleanup(); }
});

test('resolver — a second epic that does NOT hold the label no longer makes it ambiguous (INVERTED at S001/t5)', () => {
	const s = setupRepo();
	try {
		// INVERTED at S001/t5. This test previously asserted that merely ADDING
		// a second epic made `s1/t3` unresolvable — the count rule, and the
		// defect ISSUE-792f9324fc43d95c reports. The second epic below declares
		// no stories and ships no LLD/PLAN, so it cannot evidence s1 at all and
		// has no business shadowing it.
		const other = 'aaaaaaaa11112222';
		writeJson(join(s.repo, '.insrc/artifacts', `DEF-${other}.json`), {
			meta: { workflow: 'define', runId: 'd2', repoPath: s.repo, epicHash: other, epicSlug: 'other', createdAt: CREATED, schemaVersion: 1 },
			body: { flavor: 'new-capability', problem: 'y.', nonGoals: [], assumptions: [], constraints: [], stories: [], openQuestions: [] },
			citations: [],
		});
		const r = resolveWorkflowRef(s.repo, 's1/t3');
		assert.notEqual(r, null, 'exactly one epic evidences s1 — the bystander epic does not create ambiguity');
		assert.equal(r!.epicHash, EPIC_HASH);
		assert.equal(r!.taskId, 't3');
		// The issue# + hierId forms are unaffected either way.
		assert.equal(resolveWorkflowRef(s.repo, '#9')?.taskId, 't3');
		assert.equal(resolveWorkflowRef(s.repo, TASK_ID)?.taskId, 't3');
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
 *  lowercase `s1` story id the standalone route mints. */
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
	writeJson(join(dir, `LLD-${BUG_HASH}-s1.json`), {
		meta: {
			workflow: 'design.story', runId: 'l1', repoPath: repo, epicHash: BUG_HASH,
			epicSlug: 'resolver-blocked', storyId: 's1', createdAt: CREATED, epicCreatedAt: CREATED, schemaVersion: 1,
			tracker: { adapter: 'github', storyRef: 'acme/demo#77' },
		},
		body: {},
	});
	writeJson(join(dir, `PLAN-${BUG_HASH}-s1.json`), {
		meta: {
			workflow: 'plan', runId: 'p1', repoPath: repo, epicHash: BUG_HASH,
			epicSlug: 'resolver-blocked', storyId: 's1', createdAt: CREATED, epicCreatedAt: CREATED, schemaVersion: 1,
			tracker: { adapter: 'github', taskRefs: { t1: 'acme/demo#78' } },
		},
		body: { tasks: [TASK_T1], testStrategyCoverage: [] },
		citations: [],
	});
	return { repo, dir, cleanup: () => rmSync(repo, { recursive: true, force: true }) };
}

test("resolver — a DEF-less bugfix epic resolves 's1/t1' to its PlanTask (was null: unresolved-target)", () => {
	const s = setupBugfixRepo();
	try {
		const r = resolveWorkflowRef(s.repo, 's1/t1', { epicHash: BUG_HASH });
		assert.notEqual(r, null, "'s1/t1' must resolve from the ISSUE anchor when no DEF exists");
		assert.equal(r!.level, 'task');
		assert.equal(r!.storyId, 's1');
		assert.equal(r!.taskId, 't1');
		assert.equal(r!.epicSlug, 'resolver-blocked', 'epicSlug comes off the ISSUE meta');
		assert.equal(r!.createdAt, CREATED, 'createdAt comes off the ISSUE meta');
		// The PlanTask itself must be attached — a ref without it is rejected
		// downstream by resolveTaskRef as "resolved to a task, not a task".
		assert.equal(r!.task?.id, 't1');
		assert.equal(r!.task?.title, 'Characterise the defect');
	} finally { s.cleanup(); }
});

test('resolver — MUTATION (INVERTED at ISSUE-c00559b7): delete the ISSUE and the LLD heads the work item; delete the LLD too and the target goes back to null', () => {
	const s = setupBugfixRepo({ withIssue: false });
	try {
		// This used to assert null: a work item with neither DEF nor ISSUE was
		// unaddressable, which is exactly the defect that blocked every standalone
		// feature's plan from building. The LLD now heads such a work item.
		const r = resolveWorkflowRef(s.repo, 's1/t1', { epicHash: BUG_HASH });
		assert.equal(r?.task?.id, 't1', 'with no DEF or ISSUE, the LLD anchors the work item');
		assert.equal(r?.epicSlug, 'resolver-blocked', 'identity comes off the LLD meta');

		rmSync(join(s.dir, `LLD-${BUG_HASH}-s1.json`));
		assert.equal(
			resolveWorkflowRef(s.repo, 's1/t1', { epicHash: BUG_HASH }), null,
			'with no head at all the work item is unaddressable — proving a head is what makes the positive case pass',
		);
	} finally { s.cleanup(); }
});

test('resolver — an s1 story is resolvable by ISSUE NUMBER', () => {
	const s = setupBugfixRepo();
	try {
		assert.equal(resolveWorkflowRef(s.repo, '#78')?.taskId, 't1', 'taskRefs under a PLAN-<hash>-s1.json must be scanned');
		assert.equal(resolveWorkflowRef(s.repo, '#78')?.storyId, 's1');
		assert.equal(resolveWorkflowRef(s.repo, '#77')?.level, 'story', 'storyRef under an LLD-<hash>-s1.json must be scanned');
	} finally { s.cleanup(); }
});

test('resolver — the artifact id form also resolves for a DEF-less epic', () => {
	const s = setupBugfixRepo();
	try {
		const byLabel = resolveWorkflowRef(s.repo, 's1/t1', { epicHash: BUG_HASH });
		assert.notEqual(byLabel, null);
		const byHier = resolveWorkflowRef(s.repo, byLabel!.workflowId);
		assert.notEqual(byHier, null, 'the artifact id must resolve too — a DEF-less work item is enumerated by its ISSUE head');
		assert.equal(byHier!.taskId, 't1');
		assert.equal(byHier!.task?.id, 't1', 'the PlanTask is attached');
		assert.equal(byHier!.storyId, 's1');
		// And the slug resolves identically: it holds the same artifact id.
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
		const r = resolveWorkflowRef(s.repo, 's1/t1', { epicHash: BUG_HASH });
		assert.notEqual(r, null);
		assert.equal(r!.epicSlug, 'def-wins', 'the DEF is consulted first and wins outright — the ISSUE is a fallback, not a competitor');
		// The hash must be enumerated ONCE despite matching both the DEF and the
		// ISSUE pattern. If it were double-counted, this single-epic dir would
		// look like two epics and an UNSCOPED label would turn ambiguous.
		const unscoped = resolveWorkflowRef(s.repo, 's1/t1');
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

test('resolver — a bugfix epic is not shadowed by a DEF epic that lacks its story (INVERTED at S001/t5)', () => {
	const s = setupBugfixRepo();
	try {
		// INVERTED at S001/t5. This previously asserted that the mere PRESENCE
		// of a second, DEF-anchored epic made the bugfix's own `S001/t1`
		// unresolvable. That is the reported defect seen from the bugfix side:
		// the DEF epic below declares no stories and ships no story artifacts,
		// so only the bugfix epic evidences S001.
		writeJson(join(s.dir, `DEF-${EPIC_HASH}.json`), {
			meta: {
				workflow: 'define', runId: 'd2', repoPath: s.repo, epicHash: EPIC_HASH,
				epicSlug: 'other', createdAt: CREATED, schemaVersion: 1,
			},
			body: { flavor: 'new-capability', problem: 'y.', nonGoals: [], assumptions: [], constraints: [], stories: [], openQuestions: [] },
			citations: [],
		});
		const r = resolveWorkflowRef(s.repo, 's1/t1');
		assert.notEqual(r, null, 'only the ISSUE-anchored epic evidences S001 — the DEF bystander must not shadow it');
		assert.equal(r!.epicHash, BUG_HASH);
		assert.equal(r!.taskId, 't1');
		// Scoping by hash still works, as it does for DEF epics.
		assert.equal(resolveWorkflowRef(s.repo, 's1/t1', { epicHash: BUG_HASH })?.taskId, 't1');
		// And the bystander still refuses the story it does not have.
		assert.equal(resolveWorkflowRef(s.repo, 's1/t1', { epicHash: EPIC_HASH }), null);
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
		assert.notEqual(resolveWorkflowRef(s.repo, STORY_ID), null,
			'precondition: the hierarchical form resolves a story that exists');
		assert.equal(resolveWorkflowRef(s.repo, `STORY-${EPIC_HASH}-s9`), null,
			'an artifact id names its story directly and the story is still verified — s9 does not exist');
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
			epicSlug: 'declared-stories', storyId: 's1', createdAt: CREATED, epicCreatedAt: CREATED, schemaVersion: 1,
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
		const first = resolveWorkflowRef(repo, 's1');
		assert.notEqual(first, null, 'ordinal 1 is the standalone route’s single declared story');
		assert.equal(first!.storyId, 's1');
		assert.equal(resolveWorkflowRef(repo, 's2'), null, 'an ISSUE declares no second story');
	} finally { rmSync(repo, { recursive: true, force: true }); }
});

test('t3 — the lowercase label verifies and a nonexistent ordinal refuses', () => {
	const s = setupBugfixRepo();
	try {
		assert.notEqual(resolveWorkflowRef(s.repo, 's1', { epicHash: BUG_HASH }), null, 's1 verifies against the s1 artifacts');
		assert.equal(resolveWorkflowRef(s.repo, 's2', { epicHash: BUG_HASH }), null, 's2 names an ordinal that does not exist');
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

// ---------------------------------------------------------------------------
// S001/t4 — the unscoped label branch keeps candidates that RESOLVE, tiered by
// evidence strength, instead of counting epics
// ---------------------------------------------------------------------------

const RIVAL_HASH = 'dddd9999eeee0000';

/** A second DEF epic that genuinely DOES contain s1 — the real-ambiguity case. */
function addRivalDefEpicWithS1(repo: string): void {
	const dir = join(repo, '.insrc/artifacts');
	writeJson(join(dir, `DEF-${RIVAL_HASH}.json`), {
		meta: {
			workflow: 'define', runId: 'd8', repoPath: repo, epicHash: RIVAL_HASH,
			epicSlug: 'rival-feature', createdAt: CREATED, schemaVersion: 1,
		},
		body: { flavor: 'new-capability', problem: 'z.', nonGoals: [], assumptions: [], constraints: [], stories: [], openQuestions: [] },
		citations: [],
	});
	writeJson(join(dir, `LLD-${RIVAL_HASH}-s1.json`), {
		meta: {
			workflow: 'design.story', runId: 'l8', repoPath: repo, epicHash: RIVAL_HASH,
			epicSlug: 'rival-feature', storyId: 's1', createdAt: CREATED, epicCreatedAt: CREATED, schemaVersion: 1,
		},
		body: {},
	});
}

test('t4 — GENUINE ambiguity still refuses: two feature epics that BOTH contain s1, unscoped → null', () => {
	const s = setupRepo();
	try {
		addRivalDefEpicWithS1(s.repo);
		assert.equal(resolveWorkflowRef(s.repo, 's1'), null,
			'two epics evidence s1 with equal (explicit) strength — the caller must disambiguate');

		// ...and an explicit scope still picks either one out.
		const mine  = resolveWorkflowRef(s.repo, 's1', { epicHash: EPIC_HASH });
		const rival = resolveWorkflowRef(s.repo, 's1', { epicHash: RIVAL_HASH });
		assert.equal(mine?.epicHash, EPIC_HASH);
		assert.equal(rival?.epicHash, RIVAL_HASH);
	} finally { s.cleanup(); }
});

test('t4 — a tie within the EXPLICIT tier does not fall through to the implied tier', () => {
	const s = setupRepo();
	try {
		// Two explicit candidates AND a bugfix epic that implies ordinal 1. The
		// implied candidate must not win by default once the explicit tier ties.
		addRivalDefEpicWithS1(s.repo);
		addUnrelatedIssueEpic(s.repo);
		assert.equal(resolveWorkflowRef(s.repo, 's1'), null,
			'an ambiguous explicit tier refuses outright rather than deferring to the convention');
	} finally { s.cleanup(); }
});

test('t4 — a bugfix-only repo: `S001` refuses unscoped (every ISSUE epic implies one) and resolves with an explicit scope', () => {
	const s = setupBugfixRepo();
	try {
		// One bugfix epic — S001 is evidenced by its LLD, so it resolves.
		assert.notEqual(resolveWorkflowRef(s.repo, 's1'), null, 'a lone bugfix epic resolves S001 unscoped');

		// Add a SECOND bugfix epic with its own S001 artifacts: now two epics
		// evidence ordinal 1 explicitly, so the bare label is truly ambiguous.
		writeJson(join(s.dir, `ISSUE-${RIVAL_HASH}.json`), {
			meta: {
				workflow: 'issue', runId: 'i2', repoPath: s.repo, issueHash: RIVAL_HASH,
				epicSlug: 'second-bugfix', createdAt: CREATED, standalone: true,
				magnitude: 'small', schemaVersion: 1,
			},
			body: { title: 'y', reproduction: 'y', rootCause: 'y', fixIntent: 'y' },
			citations: [],
		});
		writeJson(join(s.dir, `LLD-${RIVAL_HASH}-s1.json`), {
			meta: {
				workflow: 'design.story', runId: 'l2', repoPath: s.repo, epicHash: RIVAL_HASH,
				epicSlug: 'second-bugfix', storyId: 's1', createdAt: CREATED, schemaVersion: 1,
			},
			body: {},
		});
		assert.equal(resolveWorkflowRef(s.repo, 's1'), null, 'two bugfix epics both ship an S001 — ambiguous');
		assert.equal(resolveWorkflowRef(s.repo, 's1', { epicHash: BUG_HASH })?.epicHash, BUG_HASH,
			'an explicit scope resolves it');
		assert.equal(resolveWorkflowRef(s.repo, 's1', { epicHash: RIVAL_HASH })?.epicHash, RIVAL_HASH);
	} finally { s.cleanup(); }
});

test('t4 — the ISSUE was NOT demoted: a bugfix epic is still an enumerated peer, reachable unscoped and scoped', () => {
	const s = setupBugfixRepo();
	try {
		// Pins that this is NOT the rejected alternative a2 (which would have
		// narrowed listEpicHashes back to DEF-only). A DEF-less bugfix epic is
		// still enumerated, so its story is reachable without a scope at all.
		const unscoped = resolveWorkflowRef(s.repo, 's1');
		assert.notEqual(unscoped, null, 'an ISSUE-anchored epic is enumerated, not skipped');
		assert.equal(unscoped!.epicHash, BUG_HASH);
		assert.equal(unscoped!.epicSlug, 'resolver-blocked', 'identity still comes off the ISSUE meta');

		// And the task level through the same enumeration.
		const task = resolveWorkflowRef(s.repo, 's1/t1');
		assert.notEqual(task, null);
		assert.equal(task!.level, 'task');
	} finally { s.cleanup(); }
});

test('t4 — an epic with real evidence but UNUSABLE identity counts toward ambiguity instead of vanishing', () => {
	const s = setupRepo();
	try {
		// Raised by the cold review of this Story. Candidacy is decided by
		// EVIDENCE, before any attempt to build a reference — so an epic that
		// genuinely declares the story but whose identity cannot be minted still
		// occupies its slot in the tally. The alternative (building every
		// candidate and keeping those that succeed) let such an epic disappear
		// silently, turning genuine ambiguity into a confident answer about the
		// one survivor.
		writeJson(join(s.repo, '.insrc/artifacts', `DEF-${RIVAL_HASH}.json`), {
			meta: {
				workflow: 'define', runId: 'd7', repoPath: s.repo, epicHash: RIVAL_HASH,
				epicSlug: 'broken-anchor', createdAt: 'not-a-date', schemaVersion: 1,
			},
			body: {
				flavor: 'new-capability', problem: 'q.', nonGoals: [], assumptions: [], constraints: [],
				stories: [{ id: 's1', title: 'one', userValue: 'x', acceptanceCriteria: [] }],
				openQuestions: [],
			},
			citations: [],
		});
		// Two epics evidence s1 explicitly — setupRepo's (an LLD) and this one
		// (a declaration). It stays ambiguous even though only one could ever
		// produce a reference.
		assert.equal(resolveWorkflowRef(s.repo, 's1'), null,
			'a corrupt-but-evidencing epic must not be silently dropped from the tally');

		// Scoping to the broken epic refuses, because its identity is unusable.
		assert.equal(resolveWorkflowRef(s.repo, 's1', { epicHash: RIVAL_HASH }), null);
		// Scoping to the healthy one still works.
		assert.equal(resolveWorkflowRef(s.repo, 's1', { epicHash: EPIC_HASH })?.epicHash, EPIC_HASH);
	} finally { s.cleanup(); }
});

test('t4 — a lone candidate whose reference cannot be built is a REFUSAL, not a hand-off', () => {
	const repo = mkdtempSync(join(tmpdir(), 'insrc-resolve-lone-broken-'));
	const dir = join(repo, '.insrc/artifacts');
	try {
		// The only epic evidencing s1 has an unmintable createdAt. There is no
		// runner-up to fall back to, and the answer must be null rather than a
		// malformed reference.
		writeJson(join(dir, `DEF-${DECL_HASH}.json`), {
			meta: {
				workflow: 'define', runId: 'd6', repoPath: repo, epicHash: DECL_HASH,
				epicSlug: 'lone-broken', createdAt: 'not-a-date', schemaVersion: 1,
			},
			body: {
				flavor: 'new-capability', problem: 'q.', nonGoals: [], assumptions: [], constraints: [],
				stories: [{ id: 's1', title: 'one', userValue: 'x', acceptanceCriteria: [] }],
				openQuestions: [],
			},
			citations: [],
		});
		assert.equal(resolveWorkflowRef(repo, 's1'), null);
	} finally { rmSync(repo, { recursive: true, force: true }); }
});

// ---------------------------------------------------------------------------
// S001/t6 — resolveByIssue: assert the no-op rather than assuming it
// ---------------------------------------------------------------------------

test('t6 — resolveByIssue NO-OP: issue numbers resolve at task, story and epic level exactly as before', () => {
	const s = setupRepo();
	try {
		// Task level — the PLAN taskRefs pass. storyId comes off the PLAN
		// FILENAME, so t3's clause 1 is satisfied by construction.
		const task = resolveWorkflowRef(s.repo, '#9');
		assert.notEqual(task, null);
		assert.equal(task!.level, 'task');
		assert.equal(task!.storyId, 's1');
		assert.equal(task!.taskId, 't3');
		assert.deepEqual(task!.task, TASK_T3, 'the PlanTask is still attached');

		// Story level — the LLD storyRef pass. storyId again comes off the
		// FILENAME of an artifact that exists.
		const story = resolveWorkflowRef(s.repo, '#5');
		assert.notEqual(story, null);
		assert.equal(story!.level, 'story');
		assert.equal(story!.storyId, 's1');

		// Epic level — the sub-case that passes NO storyId, so the gate is
		// never consulted.
		const epic = resolveWorkflowRef(s.repo, '#1');
		assert.notEqual(epic, null);
		assert.equal(epic!.level, 'epic');
		assert.equal(epic!.storyId, undefined);

		// An unmatched number is still a refusal.
		assert.equal(resolveWorkflowRef(s.repo, '#4040'), null);
	} finally { s.cleanup(); }
});

test('t6 — resolveByIssue, the ONE corner that is not a no-op: a DEF storyRef for a story that does not exist now refuses', () => {
	const repo = mkdtempSync(join(tmpdir(), 'insrc-resolve-phantom-'));
	const dir = join(repo, '.insrc/artifacts');
	try {
		// The third pass derives storyId from DEF `storyRefs` KEYS, which no
		// artifact evidences — unlike the task and story passes, which read it
		// off a filename. So a storyRef naming an undeclared, unbuilt story used
		// to mint a dummy ref and now refuses. That is the SAME defect class this
		// story fixes, not a regression; pinned here so the change is deliberate
		// and visible rather than an unnoticed side effect.
		writeJson(join(dir, `DEF-${DECL_HASH}.json`), {
			meta: {
				workflow: 'define', runId: 'd1', repoPath: repo, epicHash: DECL_HASH,
				epicSlug: 'phantom-storyref', createdAt: CREATED, schemaVersion: 1,
				tracker: { adapter: 'github', epicRef: 'acme/demo#100', storyRefs: { s7: 'acme/demo#107' } },
			},
			body: {
				flavor: 'new-capability', problem: 'x.', nonGoals: [], assumptions: [], constraints: [],
				stories: [],   // s7 is NOT declared
				openQuestions: [],
			},
			citations: [],
		});
		assert.equal(resolveWorkflowRef(repo, '#107'), null,
			'a storyRef for a story with no artifact and no declaration is a phantom — refused');

		// The epic-level ref on the very same DEF still resolves, proving the
		// refusal is scoped to the story sub-case and did not break the pass.
		const epic = resolveWorkflowRef(repo, '#100');
		assert.notEqual(epic, null, 'the epicRef on the same DEF is unaffected');
		assert.equal(epic!.level, 'epic');
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
test('resolveWorkflowRef accepts an artifact id, owner/repo#N, #N and an s<n> label and refuses a work-item id and an uppercase label', () => {
	const s = setupRepo();
	try {
		// every accepted form names the same Task
		for (const form of [TASK_ID, 'acme/demo#9', '#9', '9', 's1/t3']) {
			const r = resolveWorkflowRef(s.repo, form);
			assert.equal(r?.taskId, 't3', `'${form}' resolves to the Task`);
			assert.equal(r?.workflowId, TASK_ID, `'${form}' reports the Task's artifact id`);
			assert.equal(r?.slug, TASK_ID, `'${form}' reports the artifact id as its slug`);
		}
		// the id of any artifact of the work item resolves at the level it names
		assert.equal(resolveWorkflowRef(s.repo, EPIC_ID)?.level, 'epic');
		assert.equal(resolveWorkflowRef(s.repo, `DEF-${EPIC_HASH}`)?.workflowId, EPIC_ID, 'a DEF id names the Epic');
		assert.equal(resolveWorkflowRef(s.repo, `LLD-${EPIC_HASH}-s1`)?.workflowId, STORY_ID, 'an LLD id names its Story');
		assert.equal(resolveWorkflowRef(s.repo, `PLAN-${EPIC_HASH}-s1`)?.workflowId, STORY_ID);
		// a work-item id, a slug form of it, an uppercase label and an uppercase artifact id are refused
		for (const refused of [CANON_TASK, SLUG_TASK, 'E20260717185807ba:S001', 'S1', 'S001', 'S001/t3', `STORY-${EPIC_HASH}-S001`, `TASK-${EPIC_HASH}-s1-T3`, `EPIC-${EPIC_HASH.toUpperCase()}`]) {
			assert.equal(resolveWorkflowRef(s.repo, refused), null, `'${refused}' is not accepted`);
		}
		// a hash that names no work item, and a story it does not have
		assert.equal(resolveWorkflowRef(s.repo, `EPIC-${'0'.repeat(16)}`), null);
		assert.equal(resolveWorkflowRef(s.repo, `STORY-${EPIC_HASH}-s2`), null);
	} finally { s.cleanup(); }
});

test('resolveWorkflowRef reports each ResolvedRef output as the artifact id of its level, for several epics', () => {
	const s = setupBugfixRepo();
	try {
		const other = '2222333344445555';
		writeJson(join(s.dir, `DEF-${other}.json`), {
			meta: { workflow: 'define', runId: 'd2', repoPath: s.repo, epicHash: other, epicSlug: 'other-epic', createdAt: '2026-08-01T00:00:00.000Z', schemaVersion: 1,
				tracker: { adapter: 'github', epicRef: 'acme/demo#40', storyRefs: { s1: 'acme/demo#41' } } },
			body: { stories: [{ id: 's1' }] }, citations: [],
		});
		const bug = resolveWorkflowRef(s.repo, 's1/t1', { epicHash: BUG_HASH });
		assert.equal(bug?.workflowId, `TASK-${BUG_HASH}-s1-t1`);
		assert.equal(bug?.slug, bug?.workflowId);
		const story = resolveWorkflowRef(s.repo, '#41');
		assert.deepEqual([story?.level, story?.epicHash, story?.workflowId, story?.slug], ['story', other, `STORY-${other}-s1`, `STORY-${other}-s1`]);
		const epic = resolveWorkflowRef(s.repo, '#40');
		assert.deepEqual([epic?.level, epic?.workflowId, epic?.slug, epic?.createdAt], ['epic', `EPIC-${other}`, `EPIC-${other}`, '2026-08-01T00:00:00.000Z']);
		// the unscoped label is ambiguous across the two epics, and the id of either one is not
		assert.equal(resolveWorkflowRef(s.repo, 's1'), null);
		assert.equal(resolveWorkflowRef(s.repo, `STORY-${other}-s1`)?.epicHash, other);
		assert.equal(resolveWorkflowRef(s.repo, `STORY-${BUG_HASH}-s1`)?.epicHash, BUG_HASH);
	} finally { s.cleanup(); }
});

// ---------------------------------------------------------------------------

test('id marker embeds as the first body line and round-trips out', () => {
	// The marker carries the artifact id; a marker written before the artifact ids is not read.
	const artifactId = `TASK-${EPIC_HASH}-s1-t3`;
	const body = renderTaskBody('acme/demo#5', 's1', TASK_T3, 'demo-feature', EPIC_HASH, CREATED, { owner: 'acme', repo: 'demo' }, artifactId);
	assert.equal(body.split('\n')[0], `<!-- insrc:id ${artifactId} -->`);
	assert.equal(parseIdMarker(body), artifactId);
	assert.equal(parseIdMarker(`<!-- insrc:id ${CANON_TASK} -->\n\nbody`), null);
	// Without an artifact id the marker is absent.
	const bare = renderTaskBody('acme/demo#5', 's1', TASK_T3, 'demo-feature', EPIC_HASH, CREATED);
	assert.equal(parseIdMarker(bare), null);
});
