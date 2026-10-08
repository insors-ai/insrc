/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/** E1 / S001 / t5 — work-item graph: grouping, identity, membership and evidence. */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { buildWorkItemGraph, groupRecordsByWorkItem } from '../graph.js';
import type { WorkItemGraph, WorkItemNode } from '../types.js';
import {
	CREATED,
	buildRecord,
	crRecord,
	defRecord,
	extRecord,
	hldRecord,
	issueRecord,
	lldRecord,
	planRecord,
	realRecords,
	recordFromFile,
	recordSet,
	specRecord,
} from './fixtures.js';

const EPIC = 'aaaaaaaaaaaaaaaa';
const EPIC_ID = 'E20261007aaaaaaaa';

function item(graph: WorkItemGraph, id: string): WorkItemNode {
	const n = graph.items.get(id);
	assert.ok(n, `no item ${id}; have ${[...graph.items.keys()].join(', ')}`);
	return n;
}

function storyIds(graph: WorkItemGraph): string[] {
	return [...graph.items.values()].filter(n => n.kind === 'story').map(n => n.id);
}

function noticeCodes(graph: WorkItemGraph): string[] {
	return graph.notices.map(n => n.code);
}

test('a story with LLD, PLAN, BUILD and CR is one item with all four as evidence', () => {
	const graph = buildWorkItemGraph(recordSet([
		defRecord(EPIC, ['s1']),
		lldRecord(EPIC, 's1'),
		planRecord(EPIC, 's1', ['t1']),
		buildRecord(EPIC, 's1', [{ id: 't1', passed: true }]),
		crRecord(EPIC, 's1', 'pass'),
	]));
	const story = item(graph, `${EPIC_ID}:S001`);
	assert.equal(story.kind, 'story');
	assert.equal(story.parentId, EPIC_ID);
	assert.deepEqual(story.evidenceArtifactIds,
		[`BUILD-${EPIC}-s1`, `CR-${EPIC}-s1`, `LLD-${EPIC}-s1`, `PLAN-${EPIC}-s1`]);
	assert.deepEqual(item(graph, EPIC_ID).childIds, [`${EPIC_ID}:S001`]);
	assert.deepEqual(item(graph, EPIC_ID).evidenceArtifactIds, [`DEF-${EPIC}`]);
	assert.deepEqual(graph.rootIds, [EPIC_ID]);
	assert.deepEqual(graph.notices, []);
});

test('s1 and S001 records join one story and both raw ids are kept in sourceIds', () => {
	const graph = buildWorkItemGraph(recordSet([
		defRecord(EPIC, ['s1']),
		lldRecord(EPIC, 's1'),
		buildRecord(EPIC, 'S001', [{ id: 't1', passed: true }]),
	]));
	const stories = [...graph.items.values()].filter(n => n.kind === 'story');
	assert.equal(stories.length, 1);
	assert.deepEqual(stories[0]?.sourceIds, ['S001', 's1']);
	assert.deepEqual(stories[0]?.evidenceArtifactIds, [`BUILD-${EPIC}-S001`, `LLD-${EPIC}-s1`]);
});

test('the real S001/s001 pair from epic dfc0371b yields one story', () => {
	const graph = buildWorkItemGraph(recordSet(realRecords([
		'LLD-dfc0371b7200f5b5-S001.json', 'PLAN-dfc0371b7200f5b5-s001.json',
		'BUILD-dfc0371b7200f5b5-S001.json', 'CR-dfc0371b7200f5b5-S001.json',
	])));
	assert.deepEqual(storyIds(graph), ['E20260926dfc0371b:S001']);
	const story = item(graph, 'E20260926dfc0371b:S001');
	assert.deepEqual(story.sourceIds, ['S001', 's001']);
	assert.equal(story.evidenceArtifactIds.length, 4);
	assert.equal(story.title, 'surface-bugfix-workflow-properly-so-first');
});

test('LLD standalone true with BUILD standalone false (real d88062a6 and dfc0371b shapes) is one item with no notice', () => {
	const graph = buildWorkItemGraph(recordSet(realRecords([
		'LLD-d88062a6e63aa312-S001.json', 'BUILD-d88062a6e63aa312-S001.json',
		'LLD-dfc0371b7200f5b5-S001.json', 'BUILD-dfc0371b7200f5b5-S001.json',
	])));
	assert.deepEqual(storyIds(graph), ['E20260804d88062a6:S001', 'E20260926dfc0371b:S001']);
	for (const n of graph.items.values()) {
		assert.equal(n.standalone, true);
		if (n.kind === 'story') assert.equal(n.parentId, null);
	}
	assert.deepEqual(graph.notices, []);
});

test('an unparseable storyId keeps its own :R(<raw>) item and raises identity-ambiguous naming the sibling story items', () => {
	const graph = buildWorkItemGraph(recordSet([
		defRecord(EPIC, ['s1', 's2']),
		lldRecord(EPIC, 'x'),
	]));
	const raw = item(graph, `${EPIC_ID}:R(x)`);
	assert.deepEqual(raw.evidenceArtifactIds, [`LLD-${EPIC}-x`]);
	assert.deepEqual(raw.sourceIds, ['x']);
	const ambiguous = graph.notices.filter(n => n.code === 'identity-ambiguous');
	assert.equal(ambiguous.length, 1);
	assert.deepEqual(ambiguous[0]?.itemIds, [`${EPIC_ID}:R(x)`, `${EPIC_ID}:S001`, `${EPIC_ID}:S002`]);
	assert.equal(ambiguous[0]?.attention, true);
});

test('a standalone story with no head is a root with no invented epic, dated from its own LLD', () => {
	const graph = buildWorkItemGraph(recordSet([
		lldRecord('bbbbbbbbbbbbbbbb', 'S001', { standalone: true, createdAt: '2026-09-01T10:00:00.000Z', epicSlug: 'a-standalone-thing' }),
		buildRecord('bbbbbbbbbbbbbbbb', 'S001', [{ id: 't1', passed: true }], { createdAt: '2026-09-03T10:00:00.000Z' }),
	]));
	assert.deepEqual(storyIds(graph), ['E20260901bbbbbbbb:S001']);
	const story = item(graph, 'E20260901bbbbbbbb:S001');
	assert.equal(story.parentId, null);
	assert.equal(story.title, 'a-standalone-thing');
	assert.deepEqual(graph.rootIds, ['E20260901bbbbbbbb:S001']);
	assert.deepEqual(graph.notices, []);
});

test('a trivial story with only a BUILD (standalone true) and a CR is a standalone root with no unresolved-parent notice', () => {
	const graph = buildWorkItemGraph(recordSet(realRecords([
		'BUILD-d5a433047dc3439f-S001.json', 'CR-d5a433047dc3439f-S001.json',
	])));
	const story = item(graph, 'E20260930d5a43304:S001');
	assert.equal(story.standalone, true);
	assert.equal(story.parentId, null);
	assert.deepEqual(story.evidenceArtifactIds, ['BUILD-d5a433047dc3439f-S001', 'CR-d5a433047dc3439f-S001']);
	assert.deepEqual(graph.rootIds, ['E20260930d5a43304:S001']);
	assert.deepEqual(graph.notices, []);
});

test('pending and rejected EXT records create no story item and appear as epic evidence', () => {
	const graph = buildWorkItemGraph(recordSet([
		defRecord(EPIC, ['s1']),
		extRecord(EPIC, 's2'),
		extRecord(EPIC, 's3', { rejectedAt: '2026-10-07T10:00:00.000Z' }),
		extRecord(EPIC, 's4', { approvedAt: '2026-10-07T10:00:00.000Z' }),
	]));
	assert.deepEqual([...graph.items.keys()], [EPIC_ID, `${EPIC_ID}:S001`, `${EPIC_ID}:S004`]);
	assert.deepEqual(item(graph, EPIC_ID).evidenceArtifactIds, [`DEF-${EPIC}`, `EXT-${EPIC}-s2`, `EXT-${EPIC}-s3`]);
	const added = item(graph, `${EPIC_ID}:S004`);
	assert.equal(added.title, 'Story s4');
	assert.equal(added.parentId, EPIC_ID);
	assert.deepEqual(added.evidenceArtifactIds, [`EXT-${EPIC}-s4`]);
});

test('a rejected EXT whose story nothing else names is keyed epic-level and creates no story key', () => {
	const set = recordSet([defRecord(EPIC, ['s1']), extRecord(EPIC, 's7', { rejectedAt: '2026-10-07T10:00:00.000Z' })]);
	const groups = groupRecordsByWorkItem(set);
	assert.deepEqual([...groups.keys()], [`${EPIC}|`]);
	assert.deepEqual(groups.get(`${EPIC}|`)?.map(r => r.artifactId), [`DEF-${EPIC}`, `EXT-${EPIC}-s7`]);
	assert.equal(buildWorkItemGraph(set).items.has(`${EPIC_ID}:S007`), false);
});

test('records with an invalid createdAt or a non-hex hash get the H-form id and an identity-anchor-missing notice', () => {
	const graph = buildWorkItemGraph(recordSet([
		lldRecord('cccccccccccccccc', 's1', { standalone: true, createdAt: 'not-a-date' }),
		lldRecord('not-hex-hash', 's2', { standalone: true }),
		defRecord('dddddddddddddddd', [], { createdAt: 'yesterday' }),
	]));
	assert.ok(graph.items.has('Hcccccccccccccccc:S001'));
	assert.ok(graph.items.has('Hnot-hex-hash:S002'));
	assert.ok(graph.items.has('Hdddddddddddddddd'));
	const missing = graph.notices.filter(n => n.code === 'identity-anchor-missing');
	assert.deepEqual(missing.flatMap(n => n.itemIds).sort(), ['Hcccccccccccccccc:S001', 'Hdddddddddddddddd', 'Hnot-hex-hash:S002']);
	assert.ok(missing.every(n => n.attention === false));
});

test('groupRecordsByWorkItem keys an unparseable storyId as <hash>|R(x), omits SPECs, and a head-less HLD key carries an unresolved-parent notice', () => {
	const set = recordSet([
		defRecord(EPIC, ['s1'], { seededFromSpec: '5555555555555555' }),
		lldRecord(EPIC, 'x'),
		specRecord('5555555555555555'),
		hldRecord('eeeeeeeeeeeeeeee'),
	]);
	const groups = groupRecordsByWorkItem(set);
	assert.deepEqual([...groups.keys()], [`${EPIC}|`, `${EPIC}|R(x)`, 'eeeeeeeeeeeeeeee|']);
	assert.ok(![...groups.values()].flat().some(r => r.kind === 'SPEC'));

	const graph = buildWorkItemGraph(set);
	assert.ok(![...graph.items.values()].some(n => n.workItemHash === 'eeeeeeeeeeeeeeee'));
	const unresolved = graph.notices.filter(n => n.code === 'unresolved-parent');
	assert.equal(unresolved.length, 1);
	assert.deepEqual(unresolved[0]?.artifactIds, ['HLD-eeeeeeeeeeeeeeee']);
	assert.equal(unresolved[0]?.attention, true);
});

test('an epic story under a hash with no head raises unresolved-parent and gets no parent', () => {
	const graph = buildWorkItemGraph(recordSet([lldRecord('ffffffffffffffff', 's1')]));
	const story = item(graph, 'E20261007ffffffff:S001');
	assert.equal(story.parentId, null);
	assert.equal(story.standalone, false);
	assert.deepEqual(noticeCodes(graph), ['unresolved-parent']);
	assert.deepEqual(graph.notices[0]?.itemIds, ['E20261007ffffffff:S001']);
});

test('a Define story with no records yet is still a member of its epic', () => {
	const graph = buildWorkItemGraph(recordSet([defRecord(EPIC, ['s1', 's2'])]));
	assert.deepEqual(item(graph, EPIC_ID).childIds, [`${EPIC_ID}:S001`, `${EPIC_ID}:S002`]);
	assert.equal(item(graph, `${EPIC_ID}:S002`).title, 'Story s2');
	assert.deepEqual(item(graph, `${EPIC_ID}:S002`).evidenceArtifactIds, []);
	assert.equal(CREATED.slice(0, 10), '2026-10-07');
});

test('no call throws for a malformed createdAt, a non-hex hash or an unparseable storyId', () => {
	const odd = [
		recordFromFile('LLD-zz-??.json', { meta: { epicHash: 'zz', storyId: '??', createdAt: 42 }, body: null }),
		recordFromFile('DEF-zz.json', { meta: { epicHash: 'zz', createdAt: '' }, body: { stories: [{ id: 7 }, { id: 'q' }] } }),
		recordFromFile('BUILD-zz-s1.json', { meta: { epicHash: 'zz', storyId: 's1' }, body: 'not an object' }),
	];
	assert.doesNotThrow(() => buildWorkItemGraph(recordSet(odd)));
});

// ---------------------------------------------------------------------------
// t6 — tasks, issues and parents, SPECs, roots
// ---------------------------------------------------------------------------

const OTHER = '2222222222222222';
const OTHER_ID = 'E2026100722222222';

test('task t1 in two stories of different epics gets two distinct canonical ids', () => {
	const graph = buildWorkItemGraph(recordSet([
		defRecord(EPIC, ['s1']), planRecord(EPIC, 's1', ['t1']),
		defRecord(OTHER, ['s1']), planRecord(OTHER, 's1', ['t1']),
	]));
	const a = item(graph, `${EPIC_ID}:S001:T001`);
	const b = item(graph, `${OTHER_ID}:S001:T001`);
	assert.notEqual(a.id, b.id);
	assert.equal(a.kind, 'task');
	assert.equal(a.parentId, `${EPIC_ID}:S001`);
	assert.equal(a.title, 'Task t1');
	assert.deepEqual(item(graph, `${EPIC_ID}:S001`).plannedTaskIds, ['t1']);
	assert.deepEqual(item(graph, `${EPIC_ID}:S001`).childIds, [`${EPIC_ID}:S001:T001`]);
});

test('a BUILD task id equal to the story id creates no task item and no notice', () => {
	const graph = buildWorkItemGraph(recordSet(realRecords(['ISSUE-0855311b6b32eb72.json', 'BUILD-0855311b6b32eb72-S001.json'])));
	assert.equal([...graph.items.values()].some(n => n.kind === 'task'), false);
	const story = item(graph, 'E202610040855311b:S001');
	assert.deepEqual(story.childIds, []);
	assert.deepEqual(story.evidenceArtifactIds, ['BUILD-0855311b6b32eb72-S001']);
	assert.deepEqual(graph.notices, []);
});

test('tasks under an :R(x) story and under a story with an invalid createdAt get <story id>:T<nnn> ids and the builder does not throw', () => {
	let graph: WorkItemGraph | undefined;
	assert.doesNotThrow(() => {
		graph = buildWorkItemGraph(recordSet([
			defRecord(EPIC, ['s1']),
			planRecord(EPIC, 'x', ['t2']),
			planRecord('cccccccccccccccc', 's1', ['t1'], { standalone: true, createdAt: 'not-a-date' }),
		]));
	});
	assert.ok(graph);
	assert.ok(graph.items.has(`${EPIC_ID}:R(x):T002`));
	assert.ok(graph.items.has('Hcccccccccccccccc:S001:T001'));
	assert.equal(item(graph, `${EPIC_ID}:R(x):T002`).parentId, `${EPIC_ID}:R(x)`);
});

test('an issue with fix stories S001 and S002 has two distinct story children with their own tasks and evidence', () => {
	const ISSUE = '3333333333333333';
	const graph = buildWorkItemGraph(recordSet([
		issueRecord(ISSUE, { slug: 'some-fix' }, { epicSlug: 'some-fix', magnitude: 'sized' }),
		lldRecord(ISSUE, 'S001', { standalone: true }), planRecord(ISSUE, 'S001', ['t1']),
		lldRecord(ISSUE, 'S002', { standalone: true }), planRecord(ISSUE, 'S002', ['t1', 't2']),
	]));
	const issue = item(graph, 'E2026100733333333');
	assert.equal(issue.kind, 'issue');
	assert.deepEqual(issue.childIds, ['E2026100733333333:S001', 'E2026100733333333:S002']);
	assert.deepEqual(item(graph, 'E2026100733333333:S001').childIds, ['E2026100733333333:S001:T001']);
	assert.deepEqual(item(graph, 'E2026100733333333:S002').childIds, ['E2026100733333333:S002:T001', 'E2026100733333333:S002:T002']);
	assert.deepEqual(item(graph, 'E2026100733333333:S002').evidenceArtifactIds, [`LLD-${ISSUE}-S002`, `PLAN-${ISSUE}-S002`]);
	assert.deepEqual(graph.rootIds, ['E2026100733333333']);
});

test('a self-slug parentRef gives correctsRef null and no notice', () => {
	const graph = buildWorkItemGraph(recordSet(realRecords(['ISSUE-0855311b6b32eb72.json'])));
	assert.equal(item(graph, 'E202610040855311b').correctsRef, null);
	assert.deepEqual(graph.notices, []);
});

test('an issue whose outward parentRef matches nothing is present with an unresolved-parent notice', () => {
	const graph = buildWorkItemGraph(recordSet(realRecords(['ISSUE-2d9e9e694a94116b.json'])));
	const issue = item(graph, 'E202609292d9e9e69');
	assert.deepEqual(issue.correctsRef, { slug: 'vs-code-editor-dev-chat-ui', resolvedItemId: null });
	assert.deepEqual(noticeCodes(graph), ['unresolved-parent']);
	assert.deepEqual(graph.notices[0]?.itemIds, ['E202609292d9e9e69']);
});

test('a parentRef with slug and storyId (ISSUE-57446545909fe95c shape) resolves to the named story', () => {
	const graph = buildWorkItemGraph(recordSet([
		...realRecords(['ISSUE-57446545909fe95c.json']),
		defRecord('761a43a6fa645815', ['s1', 's2'], { createdAt: '2026-08-03T06:51:25.695Z', epicSlug: 'add-daemon-driven-code-review-stage' }),
	]));
	assert.deepEqual(item(graph, 'E2026100357446545').correctsRef, {
		slug: 'add-daemon-driven-code-review-stage', storyId: 's1', resolvedItemId: 'E20260803761a43a6:S001',
	});
	assert.deepEqual(graph.notices, []);
});

test('a parentRef naming an existing epic and a storyId it lacks resolves to the epic with an unresolved-parent notice naming the missing story', () => {
	const graph = buildWorkItemGraph(recordSet([
		issueRecord('4444444444444444', { slug: 'the-epic', storyId: 's5' }, { epicSlug: 'a-fix' }),
		defRecord(EPIC, ['s1'], { epicSlug: 'the-epic' }),
	]));
	const issue = item(graph, 'E2026100744444444');
	assert.equal(issue.correctsRef?.resolvedItemId, EPIC_ID);
	assert.deepEqual(noticeCodes(graph), ['unresolved-parent']);
	assert.match(graph.notices[0]?.message ?? '', /story s5/);
	assert.deepEqual(graph.notices[0]?.itemIds, ['E2026100744444444', EPIC_ID]);
});

test('a bare-hash parentRef slug (ISSUE-095906bac5bbacaf shape) resolves to the existing story without a notice', () => {
	const graph = buildWorkItemGraph(recordSet(realRecords([
		'ISSUE-095906bac5bbacaf.json', 'BUILD-d5a433047dc3439f-S001.json', 'CR-d5a433047dc3439f-S001.json',
	])));
	assert.deepEqual(item(graph, 'E20260930095906ba').correctsRef, {
		slug: 'd5a433047dc3439f', storyId: 's1', resolvedItemId: 'E20260930d5a43304:S001',
	});
	assert.deepEqual(graph.notices, []);
});

test('a hierarchical slug parentRef resolves through parseWorkflowId', () => {
	const graph = buildWorkItemGraph(recordSet([
		...realRecords(['LLD-d88062a6e63aa312-S001.json']),
		issueRecord('5555555555555555', { slug: 'E20260804d88062a6-S001' }, { epicSlug: 'a-fix' }),
	]));
	assert.equal(item(graph, 'E2026100755555555').correctsRef?.resolvedItemId, 'E20260804d88062a6:S001');
	assert.deepEqual(graph.notices, []);
});

test('a parentRef slug matching two hashes resolves to nothing and raises identity-ambiguous naming both', () => {
	const graph = buildWorkItemGraph(recordSet([
		issueRecord('6666666666666666', { slug: 'shared-slug' }, { epicSlug: 'a-fix' }),
		defRecord(EPIC, [], { epicSlug: 'shared-slug' }),
		defRecord(OTHER, [], { epicSlug: 'shared-slug' }),
	]));
	assert.equal(item(graph, 'E2026100766666666').correctsRef?.resolvedItemId, null);
	assert.deepEqual(noticeCodes(graph), ['identity-ambiguous']);
	assert.deepEqual(graph.notices[0]?.itemIds, ['E2026100722222222', 'E2026100766666666', EPIC_ID]);
});

test("a SPEC named by seededFromSpec is in that epic's evidence; an unnamed SPEC raises unattached-spec", () => {
	const graph = buildWorkItemGraph(recordSet([
		defRecord(EPIC, [], { seededFromSpec: '7777777777777777' }),
		specRecord('7777777777777777'),
		specRecord('8888888888888888'),
	]));
	const epic = item(graph, EPIC_ID);
	assert.equal(epic.seededFromSpecId, 'SPEC-7777777777777777');
	assert.deepEqual(epic.evidenceArtifactIds, [`DEF-${EPIC}`, 'SPEC-7777777777777777']);
	assert.deepEqual(noticeCodes(graph), ['unattached-spec']);
	assert.deepEqual(graph.notices[0]?.artifactIds, ['SPEC-8888888888888888']);
	assert.equal(graph.notices[0]?.attention, false);
});

test('the same record set built twice gives a deep-equal graph', () => {
	const records = [
		...realRecords(),
		defRecord(EPIC, ['s1', 's2']), planRecord(EPIC, 's1', ['t2', 't1']), lldRecord(EPIC, 'x'),
		specRecord('8888888888888888'),
	];
	const a = buildWorkItemGraph(recordSet(records));
	const b = buildWorkItemGraph(recordSet([...records].reverse()));
	assert.deepEqual([...a.items.entries()], [...b.items.entries()]);
	assert.deepEqual(a.rootIds, b.rootIds);
	assert.deepEqual(a.notices, b.notices);
	assert.deepEqual(item(a, `${EPIC_ID}:S001`).plannedTaskIds, ['t1', 't2']);
});

// ISSUE-34b6a247a4828d49 — load failures are reported, never silent.

const FAILURES = [
	{ fileName: 'LLD-aaaaaaaaaaaaaaaa-s2.json', reason: 'invalid-json' as const, detail: 'Unexpected token } in JSON at position 3' },
	{ fileName: 'BUILD-aaaaaaaaaaaaaaaa-s1.json', reason: 'unreadable' as const, detail: 'EACCES: permission denied' },
];

test('every load failure is one store-level record-unreadable notice naming the file, reason and detail', () => {
	const graph = buildWorkItemGraph(recordSet([defRecord(EPIC, ['s1', 's2'])], FAILURES));
	const unreadable = graph.notices.filter(n => n.code === 'record-unreadable');
	assert.equal(unreadable.length, 2);
	for (const f of FAILURES) {
		const n = unreadable.find(x => x.fileNames.includes(f.fileName));
		assert.ok(n, `a notice for ${f.fileName}`);
		assert.deepEqual(n.fileNames, [f.fileName]);
		assert.deepEqual(n.itemIds, [], 'store-level');
		assert.deepEqual(n.artifactIds, []);
		assert.equal(n.attention, true);
		assert.match(n.message, new RegExp(f.reason));
		assert.ok(n.message.includes(f.detail), 'the detail is in the message');
	}
});

test('items, rootIds and every other notice are the same with and without an unreadable file', () => {
	const records = [defRecord(EPIC, ['s1', 's2']), lldRecord(EPIC, 's1'), buildRecord('bbbbbbbbbbbbbbbb', 'S001', [{ id: 'S001', passed: true }], { standalone: true })];
	const clean = buildWorkItemGraph(recordSet(records));
	const failing = buildWorkItemGraph(recordSet(records, FAILURES));
	assert.deepEqual([...failing.items.entries()], [...clean.items.entries()]);
	assert.deepEqual(failing.rootIds, clean.rootIds);
	assert.deepEqual(failing.notices.filter(n => n.code !== 'record-unreadable'), clean.notices);
	assert.equal(clean.notices.some(n => n.code === 'record-unreadable'), false);
});
