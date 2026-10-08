/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/** E1 / S003 — the gate pass over fabricated records. */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { deriveGates } from '../gate.js';
import { buildWorkItemGraph } from '../graph.js';
import { deriveStages } from '../stage.js';
import type { ArtifactGate, ArtifactRecord, GatePassResult, ItemGates, WorkItemGraph, WorkItemNode } from '../types.js';
import {
	CREATED,
	amdRecord,
	buildRecord,
	crRecord,
	defRecord,
	extRecord,
	hldRecord,
	issueRecord,
	lldRecord,
	planRecord,
	realRecords,
	recordSet,
	specRecord,
} from './fixtures.js';

const EPIC  = 'aaaaaaaaaaaaaaaa';
const ISSUE = 'bbbbbbbbbbbbbbbb';
const SOLO  = 'cccccccccccccccc';
const SPEC  = 'dddddddddddddddd';
const OTHER = 'eeeeeeeeeeeeeeee';
const APPROVED = { approvedAt: CREATED };
const REVIEWED = '2026-10-08T10:00:00.000Z';

function run(records: readonly ArtifactRecord[]): { graph: WorkItemGraph; result: GatePassResult } {
	const set = recordSet(records);
	const graph = buildWorkItemGraph(set);
	return { graph, result: deriveGates(graph, set) };
}

function gateOf(result: GatePassResult, artifactId: string): ArtifactGate {
	const gate = result.artifacts.get(artifactId);
	assert.ok(gate, `an artifact gate for ${artifactId}`);
	return gate;
}

/** The node holding this artifact as evidence, of the given kind. */
function holder(graph: WorkItemGraph, artifactId: string, kind: WorkItemNode['kind']): WorkItemNode {
	const node = [...graph.items.values()].find(n => n.kind === kind && n.evidenceArtifactIds.includes(artifactId));
	assert.ok(node, `a ${kind} holding ${artifactId}`);
	return node;
}

function itemOf(result: GatePassResult, itemId: string): ItemGates {
	const gates = result.items.get(itemId);
	assert.ok(gates, `item gates for ${itemId}`);
	return gates;
}

/** A meta.review stamp with the given verdict and findings. */
function review(verdict: 'pass' | 'warn' | 'block', findings: readonly unknown[], extra: Readonly<Record<string, unknown>> = {}): Record<string, unknown> {
	return {
		artifact: 'LLD', stage: 'design.story', verdict, findings,
		counts: { high: 0, med: findings.length, low: 0 }, reviewedAt: REVIEWED, model: 'cli-claude:opus', ...extra,
	};
}

/** A copy of a fabricated record with its body replaced (bodies the builders cannot express). */
function recordWith(record: ArtifactRecord, body: unknown): ArtifactRecord {
	return { ...record, body };
}

const MED = (claimId: string): Record<string, unknown> => ({ claimId, severity: 'MED', claim: 'c', evidence: 'e' });

test('approved, rejected and unstamped artifacts read approved, rejected and pending', () => {
	const { result } = run([
		defRecord(EPIC, ['s1', 's2', 's3']),
		lldRecord(EPIC, 's1', APPROVED),
		lldRecord(EPIC, 's2', { rejectedAt: '2026-10-07T12:00:00.000Z' }),
		lldRecord(EPIC, 's3'),
	]);
	assert.deepEqual(gateOf(result, `LLD-${EPIC}-s1`).approval, { state: 'approved', at: CREATED });
	assert.deepEqual(gateOf(result, `LLD-${EPIC}-s2`).approval, { state: 'rejected', at: '2026-10-07T12:00:00.000Z' });
	assert.deepEqual(gateOf(result, `LLD-${EPIC}-s3`).approval, { state: 'pending', at: null });
	assert.equal(gateOf(result, `LLD-${EPIC}-s3`).review, null, 'no meta.review, no review');
	assert.equal(result.artifacts.size, 4, 'every record gets a gate');
});

test('an approved historical block and an overridden block do not block and still show the verdict and the override', () => {
	const override = { reason: 'accepted by the stakeholder', at: '2026-10-08T11:00:00.000Z' };
	const { result } = run([
		defRecord(EPIC, ['s1', 's2', 's3']),
		lldRecord(EPIC, 's1', { ...APPROVED, review: review('block', [MED('q1')]) }),
		lldRecord(EPIC, 's2', { review: review('block', [MED('q1')]), reviewOverride: override }),
		lldRecord(EPIC, 's3', { review: review('block', [MED('q1')]) }),
	]);

	const approved = gateOf(result, `LLD-${EPIC}-s1`).review;
	assert.equal(approved?.verdict, 'block');
	assert.equal(approved?.effectiveVerdict, 'block');
	assert.equal(approved?.blocking, false);

	const overridden = gateOf(result, `LLD-${EPIC}-s2`).review;
	assert.equal(overridden?.verdict, 'block');
	assert.deepEqual(overridden?.override, override);
	assert.equal(overridden?.blocking, false);

	const open = gateOf(result, `LLD-${EPIC}-s3`).review;
	assert.equal(open?.blocking, true, 'an unapproved block with no override blocks');
	assert.equal(open?.override, null);
	assert.deepEqual(open?.counts, { high: 0, med: 1, low: 0 });
	assert.equal(open?.reviewedAt, REVIEWED);
});

test('a block whose blocking findings are all resolved has effective verdict pass, and a warn with an unresolved MED is effectively a block', () => {
	const resolution = { findingId: 'q1', status: 'resolved', resolvedAt: REVIEWED };
	const { result } = run([
		defRecord(EPIC, ['s1', 's2']),
		lldRecord(EPIC, 's1', { review: review('block', [MED('q1'), { claimId: 'q2', severity: 'LOW' }]), reviewResolutions: { q1: resolution } }),
		lldRecord(EPIC, 's2', { review: review('warn', [MED('q1')]) }),
	]);

	const resolved = gateOf(result, `LLD-${EPIC}-s1`).review;
	assert.equal(resolved?.verdict, 'block', 'the recorded verdict is reported unchanged');
	assert.equal(resolved?.effectiveVerdict, 'pass');
	assert.equal(resolved?.resolvedFindings, 1, 'only HIGH/MED findings count');
	assert.equal(resolved?.blocking, false);

	const warn = gateOf(result, `LLD-${EPIC}-s2`).review;
	assert.equal(warn?.verdict, 'warn');
	assert.equal(warn?.effectiveVerdict, 'block');
	assert.equal(warn?.blocking, true);
});

test('a code review blocks only while its story has no approved build', () => {
	const { result } = run([
		defRecord(EPIC, ['s1', 's2', 's3']),
		buildRecord(EPIC, 's1', [{ id: 't1', passed: true }], APPROVED),
		crRecord(EPIC, 's1', 'block'),
		buildRecord(EPIC, 's2', [{ id: 't1', passed: true }]),
		crRecord(EPIC, 's2', 'block'),
		crRecord(EPIC, 's3', 'block'),
	]);
	assert.equal(gateOf(result, `CR-${EPIC}-s1`).review?.blocking, false, 'the build it guards is approved');
	assert.equal(gateOf(result, `CR-${EPIC}-s2`).review?.blocking, true, 'the build is unapproved');
	assert.equal(gateOf(result, `CR-${EPIC}-s3`).review?.blocking, true, 'there is no build');
	assert.deepEqual(gateOf(result, `CR-${EPIC}-s3`).review?.counts, { high: 0, med: 0, low: 0 }, 'a body without counts reads zeros');
	assert.equal(gateOf(result, `BUILD-${EPIC}-s1`).review, null, 'a BUILD has no review of its own');
});

test("the reviewer party is read through reviewerPartyOf, and a code review's own approval stamp is reported but does not lift its block", () => {
	const { result } = run([
		defRecord(EPIC, ['s1', 's2']),
		buildRecord(EPIC, 's1', [{ id: 't1', passed: true }]),
		crRecord(EPIC, 's1', 'block', { model: 'client', approvedAt: CREATED }),
		lldRecord(EPIC, 's2', { review: review('pass', [], { reviewedBy: 'daemon', model: 'client' }) }),
		crRecord(EPIC, 's2', 'pass'),
	]);

	const cr = gateOf(result, `CR-${EPIC}-s1`);
	assert.deepEqual(cr.approval, { state: 'approved', at: CREATED }, 'the stamp is reported');
	assert.equal(cr.review?.blocking, true, 'but the guarded build is unapproved');
	assert.equal(cr.review?.reviewedBy, 'controller', "model 'client' without reviewedBy reads as the controller");

	assert.equal(gateOf(result, `LLD-${EPIC}-s2`).review?.reviewedBy, 'daemon', 'reviewedBy wins over the model label');
	assert.equal(gateOf(result, `CR-${EPIC}-s2`).review?.reviewedBy, null, 'no reviewedBy and no model is unknown');
});

test('a malformed review, finding, code-review body, task entry or unparseable task id never throws and reports nothing invented', () => {
	const { graph, result } = run([
		defRecord(EPIC, ['s1', 's2', 's3', 's4', 's5']),
		lldRecord(EPIC, 's1', { review: 'not an object' }),
		lldRecord(EPIC, 's2', { review: review('maybe' as 'pass', []) }),
		lldRecord(EPIC, 's3', { review: { ...review('block', []), findings: [null, 'x', 7, MED('q1')] }, reviewResolutions: ['not', 'a', 'map'] }),
		lldRecord(EPIC, 's4', { review: { ...review('warn', []), findings: 'none', counts: { high: 'one', med: null } } }),
		crRecord(EPIC, 's5', 'nope' as 'pass'),
		planRecord(EPIC, 's5', ['t1']),
		recordWith(buildRecord(EPIC, 's5', [], APPROVED), { tasks: [null, 'x', { id: 5, passed: false }, { id: 't1', passed: 'yes' }, { id: 'x9', passed: false }, { id: 's2', passed: false }] }),
	]);

	assert.equal(gateOf(result, `LLD-${EPIC}-s1`).review, null, 'a non-object review is no review');
	assert.equal(gateOf(result, `LLD-${EPIC}-s2`).review, null, 'an unrecognised verdict is no review');

	const dropped = gateOf(result, `LLD-${EPIC}-s3`).review;
	assert.equal(dropped?.effectiveVerdict, 'block', 'malformed findings are dropped; the valid MED still blocks');
	assert.equal(dropped?.resolvedFindings, 0);

	const noFindings = gateOf(result, `LLD-${EPIC}-s4`).review;
	assert.equal(noFindings?.effectiveVerdict, 'warn', 'no findings array keeps the recorded verdict');
	assert.deepEqual(noFindings?.counts, { high: 0, med: 0, low: 0 });

	assert.equal(gateOf(result, `CR-${EPIC}-s5`).review, null, 'a code review with no recognised verdict is no review');

	const story = holder(graph, `BUILD-${EPIC}-s5`, 'story');
	const gates = itemOf(result, story.id);
	assert.deepEqual(gates.tasks.map(t => t.result), ['unrecorded'], "a non-boolean passed is ignored");
	assert.equal(gates.storyLevelResult, null, "'x9' and another story's id are neither a task nor this story");
	assert.equal(gates.conflict, null);
	assert.equal(gates.attentionReasons.includes('validation-failed'), false);
});

test('an unapproved block with no override is blocking and puts the item in Needs attention, and deriveStages over the same fixture gives the same stage as without the review', () => {
	const base = [defRecord(EPIC, ['s1']), lldRecord(EPIC, 's1')];
	const blocked = [defRecord(EPIC, ['s1']), lldRecord(EPIC, 's1', { review: review('block', [MED('q1')]) })];

	const out = run(blocked);
	const story = holder(out.graph, `LLD-${EPIC}-s1`, 'story');
	assert.equal(gateOf(out.result, `LLD-${EPIC}-s1`).review?.blocking, true);
	assert.deepEqual(itemOf(out.result, story.id).attentionReasons, ['pending-decision', 'review-blocked']);

	const stageOf = (records: readonly ArtifactRecord[]): string | undefined => {
		const set = recordSet(records);
		return deriveStages(buildWorkItemGraph(set), set).stages.get(story.id)?.stage;
	};
	assert.equal(stageOf(blocked), stageOf(base), 'the review never moves the stage');
	assert.equal(stageOf(blocked), 'design-plan');
});

test('an approved build with a failed task is a validation conflict and keeps both facts, and deriveStages over the same fixture still reads complete', () => {
	const records = [
		defRecord(EPIC, ['s1']),
		planRecord(EPIC, 's1', ['t1', 't2'], APPROVED),
		buildRecord(EPIC, 's1', [{ id: 't1', passed: true }, { id: 't2', passed: false }], APPROVED),
	];
	const { graph, result } = run(records);
	const story = holder(graph, `BUILD-${EPIC}-s1`, 'story');
	const gates = itemOf(result, story.id);
	const failed = gates.tasks.filter(t => t.result === 'failed').map(t => t.taskItemId);

	assert.equal(failed.length, 1);
	assert.deepEqual(gates.conflict, { failedTaskItemIds: failed, storyLevelFailed: false });
	assert.deepEqual(gates.attentionReasons, ['validation-failed', 'validation-conflict']);
	assert.deepEqual(gates.validation, { passed: 1, failed: 1, unrecorded: 0, unplanned: 0 });
	assert.equal(gateOf(result, `BUILD-${EPIC}-s1`).approval.state, 'approved', 'the approval is not altered');

	const notice = result.notices.find(n => n.code === 'validation-conflict');
	assert.ok(notice, 'a validation-conflict notice');
	assert.equal(notice.attention, true);
	assert.deepEqual(notice.artifactIds, [`BUILD-${EPIC}-s1`]);
	assert.deepEqual(notice.itemIds, [story.id, ...failed].sort());

	const set = recordSet(records);
	assert.equal(deriveStages(buildWorkItemGraph(set), set).stages.get(story.id)?.stage, 'complete');
});

test('a failed story-level result on an approved build raises the conflict (BUILD-0855311b6b32eb72-S001 shape)', () => {
	const { graph, result } = run(realRecords(['ISSUE-0855311b6b32eb72.json', 'BUILD-0855311b6b32eb72-S001.json']));
	const story = holder(graph, 'BUILD-0855311b6b32eb72-S001', 'story');
	const gates = itemOf(result, story.id);

	assert.equal(gates.storyLevelResult, 'failed');
	assert.deepEqual(gates.tasks, [], 'the story-level entry is not a task');
	assert.equal(gates.validation.unplanned, 0);
	assert.deepEqual(gates.conflict, { failedTaskItemIds: [], storyLevelFailed: true });
	assert.deepEqual(gates.attentionReasons, ['validation-failed', 'validation-conflict']);
	assert.equal(result.notices.some(n => n.code === 'unplanned-task'), false);
});

test('a planned task with no recorded result is unrecorded and counted as neither passed nor failed', () => {
	const { graph, result } = run([
		defRecord(EPIC, ['s1']),
		planRecord(EPIC, 's1', ['t1', 't2'], APPROVED),
		buildRecord(EPIC, 's1', [{ id: 't1', passed: true }]),
	]);
	const gates = itemOf(result, holder(graph, `BUILD-${EPIC}-s1`, 'story').id);
	assert.deepEqual(gates.tasks.map(t => [t.result, t.planned]), [['passed', true], ['unrecorded', true]]);
	assert.deepEqual(gates.validation, { passed: 1, failed: 0, unrecorded: 1, unplanned: 0 });
	assert.equal(gates.conflict, null);
});

test('a build task with no planned task keeps its result and is marked unplanned', () => {
	const { graph, result } = run([
		defRecord(EPIC, ['s1']),
		planRecord(EPIC, 's1', ['t1'], APPROVED),
		buildRecord(EPIC, 's1', [{ id: 't1', passed: true }, { id: 't3', passed: true }]),
	]);
	const story = holder(graph, `BUILD-${EPIC}-s1`, 'story');
	const gates = itemOf(result, story.id);
	const unplanned = gates.tasks.filter(t => !t.planned);

	assert.equal(unplanned.length, 1);
	assert.equal(unplanned[0]?.result, 'passed');
	assert.equal(gates.validation.unplanned, 1);

	const notice = result.notices.find(n => n.code === 'unplanned-task');
	assert.ok(notice, 'an unplanned-task notice');
	assert.equal(notice.attention, false);
	assert.deepEqual(notice.itemIds, [story.id, unplanned[0]?.taskItemId].sort());
	assert.deepEqual(notice.artifactIds, [`BUILD-${EPIC}-s1`]);
});

test('a pending artifact superseded by an approved later gate on the same item stops counting, even with a blocked review or as a SPEC on a story, and the rule is stated', () => {
	const { graph, result } = run([
		defRecord(EPIC, ['s1']),
		hldRecord(EPIC, APPROVED),
		lldRecord(EPIC, 's1', { review: review('block', [MED('q1')]) }),
		planRecord(EPIC, 's1', ['t1'], APPROVED),
		defRecord(OTHER, ['s1'], APPROVED),
		extRecord(OTHER, 's2'),
		amdRecord(OTHER, 1, 's2'),
		specRecord(SPEC),
		lldRecord(SOLO, 'S001', { standalone: true, sizeClass: 'small', seededFromSpec: SPEC, ...APPROVED }),
		issueRecord(ISSUE, { slug: 'nothing-here' }),
	]);

	const epic = holder(graph, `DEF-${EPIC}`, 'epic');
	const epicGates = itemOf(result, epic.id);
	assert.deepEqual(epicGates.attentionReasons, [], 'the pending DEF is superseded by the approved HLD');
	assert.match(epicGates.attentionRule, new RegExp(`DEF-${EPIC}`));

	const story = holder(graph, `LLD-${EPIC}-s1`, 'story');
	const storyGates = itemOf(result, story.id);
	assert.deepEqual(storyGates.attentionReasons, [], 'neither pending-decision nor review-blocked from the superseded LLD');
	assert.match(storyGates.attentionRule, new RegExp(`LLD-${EPIC}-s1`));
	assert.equal(gateOf(result, `LLD-${EPIC}-s1`).approval.state, 'pending', 'the superseded record still reads pending');
	assert.equal(gateOf(result, `LLD-${EPIC}-s1`).review?.blocking, true, 'and its own gate still reports the block');

	const solo = holder(graph, `SPEC-${SPEC}`, 'story');
	assert.deepEqual(itemOf(result, solo.id).attentionReasons, [], 'a pending SPEC heads the story chain');
	assert.match(itemOf(result, solo.id).attentionRule, new RegExp(`SPEC-${SPEC}`));

	for (const id of [`ISSUE-${ISSUE}`, `EXT-${OTHER}-s2`, `AMD-${OTHER}-1`]) {
		const node = [...graph.items.values()].find(n => n.kind !== 'task' && n.evidenceArtifactIds.includes(id));
		assert.ok(node, `an item holding ${id}`);
		assert.ok(itemOf(result, node.id).attentionReasons.includes('pending-decision'), `${id} is never superseded`);
	}
});

test('every epic, story and issue in the real-shape fixtures gets item gates, deterministically', () => {
	const first = run(realRecords());
	const second = run(realRecords());
	const expected = [...first.graph.items.values()].filter(n => n.kind !== 'task').map(n => n.id).sort();

	assert.deepEqual([...first.result.items.keys()].sort(), expected);
	assert.equal(first.result.artifacts.size, realRecords().length);
	assert.deepEqual([...first.result.items.entries()], [...second.result.items.entries()]);
	assert.deepEqual([...first.result.artifacts.entries()], [...second.result.artifacts.entries()]);
	assert.deepEqual(first.result.notices, second.result.notices);
	for (const gates of first.result.items.values()) {
		const node = first.graph.items.get(gates.itemId);
		if (node?.kind !== 'story') {
			assert.deepEqual(gates.tasks, []);
			assert.equal(gates.storyLevelResult, null);
			assert.equal(gates.conflict, null);
		}
	}
});
