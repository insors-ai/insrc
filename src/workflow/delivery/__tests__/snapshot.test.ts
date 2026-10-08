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
	markdownOf: r => (r.kind === 'LLD' ? { mdPath: `/repo/docs/${r.artifactId}.md`, hasMarker: true } : null),
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
	const records = [...STORE, defRecord(SOLO, ['s1']), lldRecord(SOLO, 's1'), issueRecord(ISSUE, { slug: 'nothing' })];
	const first = snapshotOf(records);
	const second = snapshotOf([...records].reverse());
	assert.deepEqual(second, first);
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
