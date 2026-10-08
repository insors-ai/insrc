/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/** E1 / S002 — the stage pass over fabricated records. */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { buildWorkItemGraph } from '../graph.js';
import { deriveStages } from '../stage.js';
import type { ArtifactRecord, StageAnnotation, StagePassResult, WorkItemGraph } from '../types.js';
import {
	CREATED,
	buildRecord,
	crRecord,
	defRecord,
	hldRecord,
	issueRecord,
	lldRecord,
	planRecord,
	realRecords,
	recordSet,
} from './fixtures.js';

const EPIC  = 'aaaaaaaaaaaaaaaa';
const ISSUE = 'bbbbbbbbbbbbbbbb';
const SOLO  = 'cccccccccccccccc';
const APPROVED = { approvedAt: CREATED };

function run(records: readonly ArtifactRecord[]): { graph: WorkItemGraph; result: StagePassResult } {
	const set = recordSet(records);
	const graph = buildWorkItemGraph(set);
	return { graph, result: deriveStages(graph, set) };
}

/** The annotation of the story with this work-item hash and ordinal. */
function storyStage(out: { graph: WorkItemGraph; result: StagePassResult }, hash: string, ordinal: number): StageAnnotation {
	const suffix = `:S${String(ordinal).padStart(3, '0')}`;
	const story = [...out.graph.items.values()].find(n => n.kind === 'story' && n.workItemHash === hash && n.id.endsWith(suffix));
	assert.ok(story, `no story ${hash}${suffix}; have ${[...out.graph.items.keys()].join(', ')}`);
	const a = out.result.stages.get(story.id);
	assert.ok(a, `no stage for ${story.id}`);
	return a;
}

/** The annotation of the issue item with this hash. */
function issueStage(out: { graph: WorkItemGraph; result: StagePassResult }, hash: string): StageAnnotation {
	const issue = [...out.graph.items.values()].find(n => n.kind === 'issue' && n.workItemHash === hash);
	assert.ok(issue, `no issue ${hash}`);
	const a = out.result.stages.get(issue.id);
	assert.ok(a, `no stage for ${issue.id}`);
	return a;
}

const epic = (stories: readonly string[] = ['s1']): ArtifactRecord[] => [defRecord(EPIC, stories, APPROVED), hldRecord(EPIC, APPROVED)];

test('a full-chain story with an approved plan and no build is ready-plan-approved, naming the plan', () => {
	const out = run([...epic(), lldRecord(EPIC, 's1', APPROVED), planRecord(EPIC, 's1', ['t1'], APPROVED)]);
	const a = storyStage(out, EPIC, 1);
	assert.equal(a.stage, 'ready-plan-approved');
	assert.equal(a.route, 'full-chain');
	assert.deepEqual(a.reason.artifactIds, [`PLAN-${EPIC}-s1`]);
	assert.match(a.reason.text, new RegExp(`PLAN-${EPIC}-s1 approved`));
	assert.doesNotMatch(a.reason.text, /running|in progress|missing/i);
});

test('a story with an unapproved build whose tasks all passed is build-recorded', () => {
	const out = run([...epic(), lldRecord(EPIC, 's1', APPROVED), planRecord(EPIC, 's1', ['t1'], APPROVED),
		buildRecord(EPIC, 's1', [{ id: 't1', passed: true }])]);
	const a = storyStage(out, EPIC, 1);
	assert.equal(a.stage, 'build-recorded');
	assert.deepEqual(a.reason.artifactIds, [`BUILD-${EPIC}-s1`]);
});

test('a story with an approved build is complete whatever its task results and review verdict', () => {
	const out = run([...epic(), lldRecord(EPIC, 's1', APPROVED), planRecord(EPIC, 's1', ['t1'], APPROVED),
		buildRecord(EPIC, 's1', [{ id: 't1', passed: false }], APPROVED), crRecord(EPIC, 's1', 'block')]);
	const a = storyStage(out, EPIC, 1);
	assert.equal(a.stage, 'complete');
	assert.deepEqual(a.reason.artifactIds, [`BUILD-${EPIC}-s1`]);
});

test('a story with no design, plan or build record is scoped', () => {
	const out = run(epic(['s1', 's2']));
	for (const n of [1, 2]) {
		const a = storyStage(out, EPIC, n);
		assert.equal(a.stage, 'scoped');
		assert.equal(a.route, 'full-chain');
		assert.equal(a.reason.text, 'no design, plan or build record');
	}
});

test("the issue magnitude decides a fix story's route ahead of its build stamp", () => {
	const out = run([issueRecord(ISSUE, undefined, { magnitude: 'small', ...APPROVED }),
		buildRecord(ISSUE, 'S001', [{ id: 'S001', passed: true }], { standalone: true, sizeClass: 'trivial' })]);
	const a = storyStage(out, ISSUE, 1);
	assert.equal(a.route, 'small-bugfix');
	assert.equal(a.stage, 'build-recorded');

	const sized = run([issueRecord(ISSUE, undefined, { magnitude: 'sized', ...APPROVED }),
		lldRecord(ISSUE, 's1', { standalone: true, sizeClass: 'bugfix' })]);
	assert.equal(storyStage(sized, ISSUE, 1).route, 'sized-bugfix');
});

test('a story under an epic never takes its route from an ISSUE that shares its hash', () => {
	// The graph makes the Define the head of a hash that also has an ISSUE.
	const out = run([...epic(), issueRecord(EPIC, undefined, { magnitude: 'small', ...APPROVED }), lldRecord(EPIC, 's1', APPROVED)]);
	const a = storyStage(out, EPIC, 1);
	assert.equal(a.route, 'full-chain');
	assert.equal(a.stage, 'design-plan', 'an approved design on the full chain waits for its plan');
});

test('a non-standalone build stamp is never read and an epic story is full-chain', () => {
	const out = run([...epic(), lldRecord(EPIC, 's1', APPROVED), planRecord(EPIC, 's1', ['t1'], APPROVED),
		buildRecord(EPIC, 's1', [{ id: 't1', passed: true }], { standalone: false, sizeClass: 'M' })]);
	const a = storyStage(out, EPIC, 1);
	assert.equal(a.route, 'full-chain');
	assert.equal(a.stage, 'build-recorded');
});

test('a sized-bugfix or full-chain story with an approved design and no plan is design-plan', () => {
	const sized = run([issueRecord(ISSUE, undefined, { magnitude: 'sized', ...APPROVED }),
		lldRecord(ISSUE, 's1', { standalone: true, sizeClass: 'bugfix', ...APPROVED })]);
	const s = storyStage(sized, ISSUE, 1);
	assert.equal(s.stage, 'design-plan');
	assert.match(s.reason.text, /ready once it has an approved plan/);

	const full = run([...epic(), lldRecord(EPIC, 's1', APPROVED)]);
	const f = storyStage(full, EPIC, 1);
	assert.equal(f.stage, 'design-plan');
	assert.deepEqual(f.reason.artifactIds, [`LLD-${EPIC}-s1`]);
});

test('an unknown or disagreeing stamp gives the unknown route, never a guess', () => {
	// No stamp anywhere on a standalone story.
	const none = storyStage(run([lldRecord(SOLO, 'S001', { standalone: true, ...APPROVED })]), SOLO, 1);
	assert.equal(none.route, 'unknown');
	assert.equal(none.stage, 'design-plan', 'an approved design with no route is not ready');
	assert.match(none.reason.text, /route unknown/);

	// A stamp that is not a SizeClass member, and 'bugfix' with no ISSUE.
	for (const sizeClass of ['M', 'bugfix', 'epic']) {
		const a = storyStage(run([lldRecord(SOLO, 'S001', { standalone: true, sizeClass })]), SOLO, 1);
		assert.equal(a.route, 'unknown', sizeClass);
	}

	// Two standalone BUILDs of one story that disagree.
	const split = storyStage(run([
		buildRecord(SOLO, 'S001', [{ id: 'S001', passed: true }], { standalone: true, sizeClass: 'small' }),
		buildRecord(SOLO, 's1', [{ id: 's1', passed: true }], { standalone: true, sizeClass: 'trivial' }),
	]), SOLO, 1);
	assert.equal(split.route, 'unknown');

	// An agreeing stamp is read.
	const trivial = storyStage(run([buildRecord(SOLO, 'S001', [{ id: 'S001', passed: true }], { standalone: true, sizeClass: 'trivial', ...APPROVED })]), SOLO, 1);
	assert.equal(trivial.route, 'trivial');
	assert.equal(trivial.stage, 'complete');
});

// ---------------------------------------------------------------------------
// t3 — issues and the pass's notices
// ---------------------------------------------------------------------------

test('a small story with an approved design and a small-bugfix issue with an approved issue are ready-design-approved with no plan notice', () => {
	const out = run([
		lldRecord(SOLO, 'S001', { standalone: true, sizeClass: 'small', ...APPROVED }),
		issueRecord(ISSUE, undefined, { magnitude: 'small', ...APPROVED }),
	]);
	const small = storyStage(out, SOLO, 1);
	assert.equal(small.stage, 'ready-design-approved');
	assert.equal(small.route, 'small');
	assert.match(small.reason.text, /needs no plan/);
	const issue = issueStage(out, ISSUE);
	assert.equal(issue.stage, 'ready-design-approved');
	assert.equal(issue.route, 'small-bugfix');
	assert.deepEqual(issue.reason.artifactIds, [`ISSUE-${ISSUE}`]);
	for (const a of [small, issue]) assert.notEqual(a.stage, 'ready-plan-approved');
	assert.deepEqual(out.result.notices, [], 'no plan-related or other notice');
});

test('a code review with no build leaves the stage and raises review-without-build', () => {
	const without = storyStage(run([...epic(), lldRecord(EPIC, 's1', APPROVED)]), EPIC, 1);
	const out = run([...epic(), lldRecord(EPIC, 's1', APPROVED), crRecord(EPIC, 's1', 'pass')]);
	const a = storyStage(out, EPIC, 1);
	assert.equal(a.stage, without.stage);
	assert.deepEqual(a.reason, without.reason, 'the CR is in no rule');
	assert.equal(out.result.notices.length, 1);
	const n = out.result.notices[0]!;
	assert.equal(n.code, 'review-without-build');
	assert.deepEqual(n.itemIds, [a.itemId]);
	assert.deepEqual(n.artifactIds, [`CR-${EPIC}-s1`]);
	assert.equal(n.attention, false);
});

test("an item with no recorded route keeps its records' stage and raises unknown-route", () => {
	const out = run([lldRecord(SOLO, 'S001', { standalone: true, ...APPROVED }), planRecord(SOLO, 'S001', ['t1'], APPROVED)]);
	const a = storyStage(out, SOLO, 1);
	assert.equal(a.route, 'unknown');
	assert.equal(a.stage, 'design-plan', 'no route, so no ready gate: the records establish design & plan');
	const unknown = out.result.notices.filter(n => n.code === 'unknown-route');
	assert.equal(unknown.length, 1);
	assert.deepEqual(unknown[0]!.itemIds, [a.itemId]);
	assert.deepEqual(unknown[0]!.artifactIds, [`LLD-${SOLO}-S001`]);
	assert.equal(unknown[0]!.attention, false);

	// A fix story whose ISSUE has no magnitude: the notice names the ISSUE whose
	// field was read, even though the ISSUE is the issue item's evidence.
	const fix = run([issueRecord(ISSUE, undefined, { magnitude: undefined }), buildRecord(ISSUE, 'S001', [{ id: 'S001', passed: true }], { standalone: false })]);
	const fixStory = storyStage(fix, ISSUE, 1);
	const fixNotice = fix.result.notices.find(n => n.code === 'unknown-route' && n.itemIds.includes(fixStory.itemId));
	assert.ok(fixNotice);
	assert.deepEqual(fixNotice.artifactIds, [`ISSUE-${ISSUE}`], 'the ISSUE, and not the non-standalone BUILD');
});

test('a story or issue with no design, plan or build is scoped', () => {
	const out = run([...epic(['s1']), issueRecord(ISSUE, undefined, { magnitude: 'sized' })]);
	assert.equal(storyStage(out, EPIC, 1).stage, 'scoped');
	const issue = issueStage(out, ISSUE);
	assert.equal(issue.stage, 'scoped', 'a pending ISSUE with no fix story');
	assert.equal(issue.route, 'sized-bugfix');

	const approvedSized = issueStage(run([issueRecord(ISSUE, undefined, { magnitude: 'sized', ...APPROVED })]), ISSUE);
	assert.equal(approvedSized.stage, 'design-plan', 'an approved sized issue waits on its design');
});

test('an issue takes the least advanced stage of its fix stories', () => {
	const out = run([
		issueRecord(ISSUE, undefined, { magnitude: 'sized', ...APPROVED }),
		lldRecord(ISSUE, 'S001', { standalone: true, sizeClass: 'bugfix', ...APPROVED }),
		planRecord(ISSUE, 'S001', ['t1'], APPROVED),
		buildRecord(ISSUE, 'S001', [{ id: 't1', passed: true }], APPROVED),
		lldRecord(ISSUE, 'S002', { standalone: true, sizeClass: 'bugfix' }),
	]);
	assert.equal(storyStage(out, ISSUE, 1).stage, 'complete');
	const s2 = storyStage(out, ISSUE, 2);
	assert.equal(s2.stage, 'design-plan');
	const issue = issueStage(out, ISSUE);
	assert.equal(issue.stage, 'design-plan');
	assert.deepEqual(issue.reason.artifactIds, s2.reason.artifactIds);
	assert.match(issue.reason.text, new RegExp(`least advanced fix story ${s2.itemId}`));

	// An issue whose route is unknown says so whichever branch placed it.
	const unknownIssue = issueStage(run([issueRecord(ISSUE, undefined, { magnitude: undefined }),
		buildRecord(ISSUE, 'S001', [{ id: 'S001', passed: true }], { standalone: true })]), ISSUE);
	assert.equal(unknownIssue.route, 'unknown');
	assert.match(unknownIssue.reason.text, /route unknown, so no ready gate applies/);
});

test('missing evidence records and wrongly typed fields never throw', () => {
	const records = [
		...epic(), lldRecord(EPIC, 's1', APPROVED), planRecord(EPIC, 's1', ['t1'], APPROVED),
		lldRecord(SOLO, 'S001', { standalone: 'yes', sizeClass: 5 }),
		issueRecord(ISSUE, undefined, { magnitude: { size: 'small' } }),
	];
	const set = recordSet(records);
	const graph = buildWorkItemGraph(set);
	// The graph names records the stage pass is not given.
	const thinned = recordSet(records.filter(r => r.kind !== 'PLAN'));
	let result: StagePassResult | undefined;
	assert.doesNotThrow(() => { result = deriveStages(graph, thinned); });
	assert.ok(result);
	const out = { graph, result };
	assert.equal(storyStage(out, EPIC, 1).stage, 'design-plan', 'the missing PLAN is skipped');
	assert.equal(storyStage(out, SOLO, 1).route, 'unknown');
	assert.equal(issueStage(out, ISSUE).route, 'unknown');
});

test('every story and issue in the real-shape fixtures gets exactly one stage, deterministically', () => {
	const set = recordSet(realRecords());
	const graph = buildWorkItemGraph(set);
	const first = deriveStages(graph, set);
	const expected = [...graph.items.values()].filter(n => n.kind === 'story' || n.kind === 'issue').map(n => n.id).sort();
	assert.deepEqual([...first.stages.keys()], expected);
	const reversed = recordSet([...realRecords()].reverse());
	const second = deriveStages(buildWorkItemGraph(reversed), reversed);
	assert.deepEqual([...second.stages.entries()], [...first.stages.entries()]);
	assert.deepEqual(second.notices, first.notices);
});
