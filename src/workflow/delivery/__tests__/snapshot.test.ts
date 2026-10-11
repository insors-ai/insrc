/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/** E1 / S005 — the snapshot assembler over fabricated records. */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { deriveCurrency } from '../currency.js';
import { deriveGates } from '../gate.js';
import { buildWorkItemGraph } from '../graph.js';
import { ATTENTION_RULE, assembleSnapshot } from '../snapshot.js';
import { deriveStages } from '../stage.js';
import type { ArtifactRecord, DeliveryItem, DeliveryMarkdownPort, DeliverySnapshot } from '../types.js';
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
	recordSet,
	specRecord,
} from './fixtures.js';

const EPIC  = 'aaaaaaaaaaaaaaaa';
const ISSUE = 'bbbbbbbbbbbbbbbb';
const SOLO  = 'cccccccccccccccc';
const APPROVED = { approvedAt: CREATED };

/** A port that reports every LLD under docs/ with its marker, and nothing else. */
const PORT: DeliveryMarkdownPort = {
	markdownOf: r => (r.kind === 'LLD' ? { mdPath: `/repo/docs/${r.artifactId}.md`, realPath: `/repo/docs/${r.artifactId}.md`, hasMarker: true } : null),
};

function snapshotOf(records: readonly ArtifactRecord[], port: DeliveryMarkdownPort = PORT): DeliverySnapshot {
	const set = recordSet(records);
	const graph = buildWorkItemGraph(set);
	return assembleSnapshot(set, graph, deriveStages(graph, set), deriveGates(graph, set), deriveCurrency(graph, set), port);
}

function item(s: DeliverySnapshot, pred: (i: DeliveryItem) => boolean, label: string): DeliveryItem {
	const found = s.items.find(pred);
	assert.ok(found, `an item: ${label}`);
	return found;
}

/** Fails on any Map, Set or undefined anywhere in the value. */
function assertPlainJson(value: unknown, path = '$'): void {
	assert.notEqual(value, undefined, `${path} is undefined`);
	assert.ok(!(value instanceof Map) && !(value instanceof Set), `${path} is a Map or Set`);
	if (Array.isArray(value)) value.forEach((v, i) => assertPlainJson(v, `${path}[${i}]`));
	else if (typeof value === 'object' && value !== null) for (const [k, v] of Object.entries(value)) assertPlainJson(v, `${path}.${k}`);
}

const STORE: readonly ArtifactRecord[] = [
	defRecord(EPIC, ['s1', 's2'], APPROVED),
	hldRecord(EPIC, APPROVED),
	amdRecord(EPIC, 1, 's3'),
	lldRecord(EPIC, 's1', APPROVED),
	planRecord(EPIC, 's1', ['t1'], APPROVED),
	buildRecord(EPIC, 's1', [{ id: 't1', passed: true }], APPROVED),
	crRecord(EPIC, 's1', 'pass'),
	lldRecord(EPIC, 's2'),
];

test('every work item is joined with its stage, evidence, gates, currency and notices', () => {
	const s = snapshotOf(STORE);
	assert.equal(s.schemaVersion, 1);
	assert.equal(s.repo, '/repo');
	assert.equal(s.takenAt, '2026-10-07T00:00:00.000Z', 'the record set read time');
	assert.equal(s.recordCount, STORE.length);
	assert.equal(s.unreadableCount, 0);
	assert.deepEqual(s.items.map(i => i.id), [...s.items.map(i => i.id)].sort(), 'sorted by id');
	assert.deepEqual(s.counts.items, { epic: 1, story: 2, task: 1, issue: 0 });
	assert.deepEqual(Object.keys(s.counts.byStage), ['scoped', 'design-plan', 'ready-design-approved', 'ready-plan-approved', 'build-recorded', 'complete']);
	assert.equal(s.attentionRule, ATTENTION_RULE);

	const epic = item(s, i => i.kind === 'epic', 'epic');
	assert.equal(epic.stage, null);
	assert.deepEqual(epic.amendments.map(a => a.amendmentId), [`AMD-${EPIC}-1`]);
	assert.equal(epic.validation, null);

	const done = item(s, i => i.kind === 'story' && i.sourceIds.includes('s1'), 's1');
	assert.equal(done.stage?.stage, 'complete');
	assert.equal(done.stage?.route, 'full-chain');
	assert.deepEqual(done.evidence.map(e => e.artifactId), [`BUILD-${EPIC}-s1`, `CR-${EPIC}-s1`, `LLD-${EPIC}-s1`, `PLAN-${EPIC}-s1`]);
	const lld = done.evidence.find(e => e.kind === 'LLD');
	assert.deepEqual([lld?.mdPath, lld?.openWith, lld?.approval.state], [`/repo/docs/LLD-${EPIC}-s1.md`, 'review-view', 'approved']);
	const build = done.evidence.find(e => e.kind === 'BUILD');
	assert.deepEqual([build?.mdPath, build?.openWith, build?.review, build?.reviewCurrency], [null, 'evidence-read', null, null]);
	const cr = done.evidence.find(e => e.kind === 'CR');
	assert.equal(cr?.review?.verdict, 'pass');
	assert.equal(cr?.reviewCurrency, 'unknown');
	assert.deepEqual(done.validation, { passed: 1, failed: 0, unrecorded: 0, unplanned: 0 });
	assert.equal(done.tasks.length, 1);
	assert.equal(done.needsAttention, false);

	const task = item(s, i => i.kind === 'task', 'task');
	assert.deepEqual([task.stage, task.tasks, task.validation], [null, [], null]);

	const pending = item(s, i => i.kind === 'story' && i.sourceIds.includes('s2'), 's2');
	assert.equal(pending.stage?.stage, 'design-plan');
	assert.deepEqual(pending.attentionReasons, ['pending-decision']);
	assert.equal(s.counts.needsAttention, s.items.filter(i => i.needsAttention).length);

	assertPlainJson(s);
	assert.deepEqual(JSON.parse(JSON.stringify(s)), s, 'survives a JSON round trip unchanged');
});

test('two snapshots of the same store, with equal timestamps, are identical in order and counts', () => {
	// Every fabricated record shares one createdAt, so no order can come from time.
	// Descriptions and feedback (with equal timestamps across records) take part too.
	const fb = (id: string) => ({ id, author: 'reviewer', timestamp: CREATED, target: { file: 'docs/x.md' }, comment: `note ${id}` });
	const records = [...STORE, defRecord(SOLO, [{ id: 's1', userValue: 'Value', sizeEstimate: 'S' }], {}, { problem: 'Problem', feedback: [fb('f2'), fb('f1')] }),
		lldRecord(SOLO, 's1', {}, { feedback: [fb('f1')] }), planRecord(SOLO, 's1', ['t1'], {}, { feedback: [fb('f0')] }),
		issueRecord(ISSUE, { slug: 'nothing' }, {}, { fixIntent: 'Fix it' })];
	const first = snapshotOf(records);
	const second = snapshotOf([...records].reverse());
	assert.deepEqual(second, first);
	assert.ok(first.items.some(i => i.feedback.length > 0) && first.items.some(i => i.description.kind === 'issue' && i.description.fixIntent.state === 'recorded'),
		'the compared snapshots carry feedback and recorded descriptions');
	assert.deepEqual(second.items.map(i => i.id), first.items.map(i => i.id));
	assert.deepEqual(second.counts, first.counts);
});

test('needsAttention comes from a gate reason or an attention notice, each reason listed once, and store-level notices stay off items', () => {
	const s = snapshotOf([
		defRecord(EPIC, ['s1']),
		planRecord(EPIC, 's1', ['t1'], APPROVED),
		buildRecord(EPIC, 's1', [{ id: 't1', passed: false }], APPROVED),   // validation conflict
		defRecord(SOLO, ['s1']),
		lldRecord(SOLO, 'sX', APPROVED),                                     // unparseable story id: identity-ambiguous (another epic)
		specRecord('dddddddddddddddd'),                                       // named by no item: unattached-spec
	]);
	const conflicted = item(s, i => i.kind === 'story' && i.sourceIds.includes('s1'), 's1');
	assert.deepEqual(conflicted.attentionReasons, ['validation-failed', 'validation-conflict'], 'validation-conflict once');
	assert.equal(conflicted.needsAttention, true);

	const ambiguous = item(s, i => i.sourceIds.includes('sX'), 'sX');
	assert.ok(ambiguous.notices.some(n => n.code === 'identity-ambiguous'));
	assert.ok(ambiguous.attentionReasons.includes('identity-ambiguous'));
	assert.equal(ambiguous.needsAttention, true);

	assert.ok(s.notices.some(n => n.code === 'unattached-spec'), 'a store-level notice');
	assert.ok(s.notices.every(n => n.itemIds.length === 0));
	assert.ok(s.items.every(i => i.notices.every(n => n.itemIds.includes(i.id))), 'an item carries only notices naming it');
});

test('a full-chain, feature or sized-bugfix story with a build and no plan gets incomplete-evidence, and small, small-bugfix and trivial stories do not', () => {
	const SIZED = 'eeeeeeeeeeeeeeee';
	const FEATURE = 'ffffffffffffffff';
	const SMALL = '1111111111111111';
	const TRIVIAL = '2222222222222222';
	const s = snapshotOf([
		defRecord(EPIC, ['s1']),
		buildRecord(EPIC, 's1', [{ id: 't1', passed: true }]),                                        // full-chain
		lldRecord(FEATURE, 'S001', { standalone: true, sizeClass: 'feature' }),
		buildRecord(FEATURE, 'S001', [{ id: 't1', passed: true }], { standalone: true }),             // feature
		issueRecord(SIZED, { slug: 'x' }, { magnitude: 'sized' }),
		buildRecord(SIZED, 'S001', [{ id: 'S001', passed: true }], { standalone: true }),             // sized-bugfix
		lldRecord(SMALL, 'S001', { standalone: true, sizeClass: 'small' }),
		buildRecord(SMALL, 'S001', [{ id: 'S001', passed: true }], { standalone: true }),             // small
		issueRecord(ISSUE, { slug: 'y' }, { magnitude: 'small' }),
		buildRecord(ISSUE, 'S001', [{ id: 'S001', passed: true }], { standalone: true }),             // small-bugfix
		buildRecord(TRIVIAL, 'S001', [{ id: 'S001', passed: true }], { standalone: true, sizeClass: 'trivial' }), // trivial
	]);
	const routeOf = (i: DeliveryItem): string | undefined => i.stage?.route;
	const flagged = (i: DeliveryItem): boolean => i.notices.some(n => n.code === 'incomplete-evidence' && /no plan/.test(n.message));
	const stories = s.items.filter(i => i.kind === 'story');
	const byRoute = new Map(stories.map(i => [routeOf(i), i] as const));
	for (const route of ['full-chain', 'feature', 'sized-bugfix']) {
		const story = byRoute.get(route);
		assert.ok(story, `a ${route} story`);
		assert.equal(flagged(story), true, `${route} with a build and no plan is flagged`);
		assert.deepEqual(story.notices.find(n => n.code === 'incomplete-evidence' && /no plan/.test(n.message))?.artifactIds,
			story.evidence.filter(e => e.kind === 'BUILD').map(e => e.artifactId));
	}
	for (const route of ['small', 'small-bugfix', 'trivial']) {
		const story = byRoute.get(route);
		assert.ok(story, `a ${route} story`);
		assert.equal(flagged(story), false, `${route} is never flagged`);
	}
});

const DESC = 'dddddddddddddddd';
const FIX  = 'eeeeeeeeeeeeeeee';
const byKindAndSource = (s: DeliverySnapshot, kind: DeliveryItem['kind'], hashPrefix: string, sourceId?: string): DeliveryItem =>
	item(s, i => i.kind === kind && i.id.toLowerCase().includes(hashPrefix) && (sourceId === undefined || i.sourceIds.includes(sourceId)), `${kind} ${hashPrefix} ${sourceId ?? ''}`);

test('an epic\'s problem and summary, a story\'s purpose and size, and an issue\'s reproduction, root cause and fix intent are published from their records', () => {
	const def = defRecord(DESC, [{ id: 's1', userValue: 'Readers find the right section quickly', sizeEstimate: 'M' }, 's2'], APPROVED,
		{ problem: 'Generated documents are hard to navigate.\n', summary: { prose: 'Make documents navigable.', audience: 'product' } });
	const issue = issueRecord(FIX, { slug: 'nothing' }, {}, { reproduction: 'Open the board; no purpose shows.', rootCause: 'The snapshot drops it.', fixIntent: 'Publish it.' });
	const s = snapshotOf([def, lldRecord(DESC, 's1'), lldRecord(DESC, 's2'), issue]);
	const epic = byKindAndSource(s, 'epic', 'dddddddd');
	assert.deepEqual(epic.description, {
		kind: 'epic',
		problem: { state: 'recorded', value: 'Generated documents are hard to navigate.\n', artifactId: def.artifactId },
		summary: { state: 'recorded', value: 'Make documents navigable.', artifactId: def.artifactId },
	}, 'values exactly as stored, with the record they came from');
	assert.deepEqual(byKindAndSource(s, 'story', 'dddddddd', 's1').description, {
		kind: 'story',
		purpose: { state: 'recorded', value: 'Readers find the right section quickly', artifactId: def.artifactId },
		size: { state: 'recorded', value: 'M', artifactId: def.artifactId },
	});
	assert.deepEqual(byKindAndSource(s, 'issue', 'eeeeeeee').description, {
		kind: 'issue',
		reproduction: { state: 'recorded', value: 'Open the board; no purpose shows.', artifactId: issue.artifactId },
		rootCause: { state: 'recorded', value: 'The snapshot drops it.', artifactId: issue.artifactId },
		fixIntent: { state: 'recorded', value: 'Publish it.', artifactId: issue.artifactId },
	});
	for (const i of s.items) assert.equal(i.description.kind, i.kind, `${i.id}: the description matches the item's kind`);
	assertPlainJson(s);
});

test('missing, blank or wrongly typed values read not recorded, and a value that does not apply to a kind is absent', () => {
	const def = defRecord(DESC, [{ id: 's1', userValue: '   ', sizeEstimate: 'XXL' }, { id: 's2', userValue: 42 }, 's3'], APPROVED,
		{ problem: '', summary: { prose: 7 } });
	const issue = issueRecord(FIX, { slug: 'nothing' }, {}, { reproduction: ['not', 'text'], rootCause: '\t' });
	const s = snapshotOf([def, lldRecord(DESC, 's1'), lldRecord(DESC, 's2'), lldRecord(DESC, 's3'), planRecord(DESC, 's1', ['t1']), issue]);
	const none = { state: 'not-recorded' };
	assert.deepEqual(byKindAndSource(s, 'epic', 'dddddddd').description, { kind: 'epic', problem: none, summary: none });
	for (const sid of ['s1', 's2', 's3']) assert.deepEqual(byKindAndSource(s, 'story', 'dddddddd', sid).description, { kind: 'story', purpose: none, size: none }, sid);
	assert.deepEqual(byKindAndSource(s, 'issue', 'eeeeeeee').description, { kind: 'issue', reproduction: none, rootCause: none, fixIntent: none });
	const task = item(s, i => i.kind === 'task', 'a task');
	assert.deepEqual(task.description, { kind: 'task' }, 'a task carries no descriptive fields');
	assert.ok(!('fixIntent' in byKindAndSource(s, 'story', 'dddddddd', 's1').description), 'a story has no fix intent field');
	// The same store gives the same descriptions.
	assert.deepEqual(snapshotOf([def, lldRecord(DESC, 's1'), lldRecord(DESC, 's2'), lldRecord(DESC, 's3'), planRecord(DESC, 's1', ['t1']), issue]).items.map(i => i.description),
		s.items.map(i => i.description));
});

test('a story added by an extension takes its purpose from the EXT, and a standalone story reads not recorded', () => {
	const def = defRecord(DESC, ['s1'], APPROVED, { problem: 'P' });
	const ext = extRecord(DESC, 's2', { approvedAt: CREATED }, { userValue: 'Added later for operators' });
	const solo = lldRecord(SOLO, 's1', { standalone: true });
	const fix = lldRecord(FIX, 's1');
	const s = snapshotOf([def, lldRecord(DESC, 's1'), ext, solo, issueRecord(FIX, { slug: 'nothing' }), fix]);
	assert.deepEqual(byKindAndSource(s, 'story', 'dddddddd', 's2').description,
		{ kind: 'story', purpose: { state: 'recorded', value: 'Added later for operators', artifactId: ext.artifactId }, size: { state: 'not-recorded' } });
	const none = { state: 'not-recorded' };
	assert.deepEqual(byKindAndSource(s, 'story', 'cccccccc').description, { kind: 'story', purpose: none, size: none }, 'a standalone story');
	assert.deepEqual(byKindAndSource(s, 'story', 'eeeeeeee').description, { kind: 'story', purpose: none, size: none }, 'an issue\'s fix story');
});

test('feedback from an item\'s own design records is listed read-only, in order, and malformed entries are noticed', () => {
	const entry = (id: string, timestamp: string, extra: Record<string, unknown> = {}) =>
		({ id, author: 'ana', timestamp, target: { file: 'docs/epic/LLD.md', version: 'v2', segment: { startLine: 3, endLine: 9 } }, comment: `comment ${id}`, kind: 'suggestion', ...extra });
	const def = defRecord(DESC, ['s1'], APPROVED, { feedback: [entry('d1', '2026-10-08T10:00:00.000Z')] });
	const hld = hldRecord(DESC, APPROVED, { feedback: [entry('h1', '2026-10-08T09:00:00.000Z')] });
	const lld = lldRecord(DESC, 's1', {}, { feedback: [
		entry('l2', '2026-10-08T11:00:00.000Z'),
		{ id: 'bad', author: 'ana', comment: 'no timestamp', target: { file: 'x' } },
		{ id: 'l1', author: 'bo', timestamp: '2026-10-08T11:00:00.000Z', target: { file: 'docs/epic/LLD.md' }, comment: 'bare' },
		'not an entry',
	] });
	const plan = planRecord(DESC, 's1', ['t1'], {}, { feedback: [entry('p1', '2026-10-08T11:00:00.000Z')] });
	const build = buildRecord(DESC, 's1', [{ id: 't1', passed: true }], {});
	const buildWithFeedback = { ...build, body: { ...(build.body as object), feedback: [entry('b1', '2026-10-08T12:00:00.000Z')] } };
	const issue = issueRecord(FIX, { slug: 'nothing' }, {}, { feedback: [entry('i1', '2026-10-08T12:00:00.000Z')] });
	// Not a list, though it looks like one well-formed entry: left out whole.
	const odd = hldRecord(SOLO, {}, { feedback: entry('lone', '2026-10-08T12:00:00.000Z') });
	const s = snapshotOf([def, hld, lld, plan, buildWithFeedback, issue, defRecord(SOLO, ['s1']), odd]);

	const epic = byKindAndSource(s, 'epic', 'dddddddd');
	assert.deepEqual(epic.feedback.map(f => [f.artifactId, f.id]), [[hld.artifactId, 'h1'], [def.artifactId, 'd1']], 'the epic\'s DEF and HLD, by timestamp');
	assert.deepEqual(epic.feedback[1], {
		artifactId: def.artifactId, id: 'd1', author: 'ana', timestamp: '2026-10-08T10:00:00.000Z', kind: 'suggestion', comment: 'comment d1',
		target: { file: 'docs/epic/LLD.md', version: 'v2', segment: { startLine: 3, endLine: 9 } },
	});
	const story = byKindAndSource(s, 'story', 'dddddddd', 's1');
	assert.deepEqual(story.feedback.map(f => [f.artifactId, f.id]), [[lld.artifactId, 'l1'], [lld.artifactId, 'l2'], [plan.artifactId, 'p1']],
		'the story\'s LLD and PLAN by timestamp, then artifactId, then id; never the epic\'s, and never the BUILD\'s');
	assert.deepEqual(story.feedback[0], {
		artifactId: lld.artifactId, id: 'l1', author: 'bo', timestamp: '2026-10-08T11:00:00.000Z', kind: null, comment: 'bare',
		target: { file: 'docs/epic/LLD.md', version: null, segment: null },
	}, 'absent kind, version and segment are null');
	assert.ok(!epic.feedback.some(f => f.artifactId === lld.artifactId), 'a child\'s feedback is not the epic\'s');
	assert.deepEqual(item(s, i => i.kind === 'task', 'a task').feedback, [], 'a task inherits none of its story\'s PLAN feedback');
	assert.deepEqual(byKindAndSource(s, 'issue', 'eeeeeeee').feedback, [], 'an ISSUE body is not read for feedback');

	const notice = story.notices.find(n => n.code === 'incomplete-evidence' && n.artifactIds.includes(lld.artifactId));
	assert.ok(notice !== undefined, 'the malformed entries are named');
	assert.match(notice.message, /2 feedback entries that could not be read/);
	assert.equal(notice.attention, false);
	const solo = byKindAndSource(s, 'epic', 'cccccccc');
	assert.deepEqual(solo.feedback, []);
	assert.ok(solo.notices.some(n => n.code === 'incomplete-evidence' && n.artifactIds.includes(odd.artifactId) && /not a list/.test(n.message)), 'feedback that is not a list is named');
	assertPlainJson(s);
});
