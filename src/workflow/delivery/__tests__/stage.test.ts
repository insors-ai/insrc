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
