/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/** E1 / S004 — the currency pass over fabricated records. */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { computeHldEffectiveHash } from '../../artifacts/lld.js';
import { deriveCurrency } from '../currency.js';
import { buildWorkItemGraph } from '../graph.js';
import type { ArtifactCurrency, ArtifactRecord, CurrencyPassResult, WorkItemGraph } from '../types.js';
import {
	CREATED,
	amdRecord,
	buildRecord,
	crRecord,
	defRecord,
	hldRecord,
	lldRecord,
	planRecord,
	recordFromFile,
	recordSet,
} from './fixtures.js';

const EPIC = 'aaaaaaaaaaaaaaaa';
const RUN  = 'wf-hld-run-1';
const REVIEWED = '2026-10-08T10:00:00.000Z';
const REVIEW = { review: { artifact: 'x', stage: 'design.story', verdict: 'pass', findings: [], counts: { high: 0, med: 0, low: 0 }, reviewedAt: REVIEWED, model: 'cli-claude:opus' } };

function run(records: readonly ArtifactRecord[]): { graph: WorkItemGraph; result: CurrencyPassResult } {
	const set = recordSet(records);
	const graph = buildWorkItemGraph(set);
	return { graph, result: deriveCurrency(graph, set) };
}

function currencyOf(result: CurrencyPassResult, artifactId: string): ArtifactCurrency {
	const c = result.artifacts.get(artifactId);
	assert.ok(c, `a currency entry for ${artifactId}`);
	return c;
}

/** An AMD that passes isAmendmentRecord, as the store writes them. */
function amd(n: number, storyId: string, fields: Readonly<Record<string, unknown>> = {}): ArtifactRecord {
	return amdRecord(EPIC, n, storyId, {
		epicSlug: 'e1', hldBaseRunId: RUN, rationale: 'extends the epic', citations: [], proposedBy: { role: 'controller' }, ...fields,
	});
}

const approvedAmd = (n: number, storyId: string, approvedAt: string): ArtifactRecord => amd(n, storyId, { status: 'approved', approvedAt });

/** An LLD of the epic with a review and the given HLD stamps. */
function lld(storyId: string, effective: string, extra: Readonly<Record<string, unknown>> = {}): ArtifactRecord {
	return lldRecord(EPIC, storyId, { ...REVIEW, hldBaseRunId: RUN, hldEffectiveHash: effective, hldAmendmentsApplied: [], runId: `wf-lld-${storyId}`, ...extra });
}

test('a review is current or stale only where a recorded field settles it, and unknown otherwise', () => {
	const current = computeHldEffectiveHash(RUN, []);
	const { result } = run([
		defRecord(EPIC, ['s1', 's2', 's3', 's4'], REVIEW),
		hldRecord(EPIC, { ...REVIEW, runId: RUN }),
		lld('s1', current),
		lld('s2', computeHldEffectiveHash('wf-old-run', []), { hldBaseRunId: 'wf-old-run' }),
		lld('s3', current),
		planRecord(EPIC, 's3', ['t1'], { ...REVIEW, lldRunId: 'wf-lld-s3', lldEffectiveHash: current }),
		lld('s4', current),
		planRecord(EPIC, 's4', ['t1'], { ...REVIEW, lldRunId: 'wf-lld-other', lldEffectiveHash: current }),
		buildRecord(EPIC, 's1', [{ id: 't1', passed: true }], { approvedAt: CREATED, updatedAt: '2026-10-09T00:00:00.000Z' }),
		crRecord(EPIC, 's1', 'pass'),
	]);

	assert.equal(currencyOf(result, `LLD-${EPIC}-s1`).reviewCurrency, 'current');
	assert.match(currencyOf(result, `LLD-${EPIC}-s1`).basis ?? '', /hldEffectiveHash matches/);
	const rerun = currencyOf(result, `LLD-${EPIC}-s2`);
	assert.equal(rerun.reviewCurrency, 'stale');
	assert.match(rerun.basis ?? '', /^hld-rerun/);

	assert.equal(currencyOf(result, `PLAN-${EPIC}-s3`).reviewCurrency, 'current');
	const plan = currencyOf(result, `PLAN-${EPIC}-s4`);
	assert.equal(plan.reviewCurrency, 'stale');
	assert.match(plan.basis ?? '', /lldRunId differ/);

	for (const id of [`DEF-${EPIC}`, `HLD-${EPIC}`, `CR-${EPIC}-s1`]) {
		assert.deepEqual(currencyOf(result, id), { artifactId: id, reviewCurrency: 'unknown', basis: null }, `${id} reads unknown`);
	}
	assert.equal(currencyOf(result, `CR-${EPIC}-s1`).reviewCurrency, 'unknown', 'a build approved after its review never makes the review stale');
	assert.deepEqual(currencyOf(result, `BUILD-${EPIC}-s1`), { artifactId: `BUILD-${EPIC}-s1`, reviewCurrency: null, basis: null });
});

test('amendments are hashed in approvedAt order and listed in amendmentId order with their status', () => {
	// Approved out of id order, with an approvedAt tie between -2 and -10.
	const counted = [approvedAmd(3, 's7', '2026-10-01T00:00:00.000Z'), approvedAmd(10, 's8', '2026-10-02T00:00:00.000Z'), approvedAmd(2, 's9', '2026-10-02T00:00:00.000Z')];
	const order = [`AMD-${EPIC}-3`, `AMD-${EPIC}-2`, `AMD-${EPIC}-10`];
	const matching = computeHldEffectiveHash(RUN, order);
	const records = [
		defRecord(EPIC, ['s1', 's2', 's3']),
		hldRecord(EPIC, { runId: RUN }),
		...counted,
		amd(4, 's10'),                                                              // pending
		amd(5, 's11', { status: 'rejected', rejectedAt: CREATED }),                 // rejected
		amdRecord(EPIC, 6, 's12', { status: 'approved', approvedAt: '2026-10-03T00:00:00.000Z' }), // malformed: fails isAmendmentRecord
		lld('s1', matching, { hldAmendmentsApplied: order }),
		lld('s2', computeHldEffectiveHash(RUN, [`AMD-${EPIC}-3`]), { hldAmendmentsApplied: [`AMD-${EPIC}-3`] }),
		lld('s3', 'edited-hash', { hldAmendmentsApplied: order, staleAckedAt: '2026-10-05T00:00:00.000Z' }),
	];
	const { graph, result } = run(records);

	assert.equal(currencyOf(result, `LLD-${EPIC}-s1`).reviewCurrency, 'current', 'hashed as the scanner orders them');
	const missing = currencyOf(result, `LLD-${EPIC}-s2`);
	assert.equal(missing.reviewCurrency, 'stale');
	assert.match(missing.basis ?? '', new RegExp(`amendment AMD-${EPIC}-2 is not in hldAmendmentsApplied`));
	const unexplained = currencyOf(result, `LLD-${EPIC}-s3`);
	assert.equal(unexplained.reviewCurrency, 'stale');
	assert.match(unexplained.basis ?? '', /no amendment identified; staleness acknowledged at 2026-10-05/);

	const epic = [...graph.items.values()].find(n => n.kind === 'epic');
	assert.ok(epic);
	const list = result.amendments.get(epic.id) ?? [];
	assert.deepEqual(list.map(a => a.amendmentId), [...list.map(a => a.amendmentId)].sort(), 'sorted by amendmentId');
	const byId = new Map(list.map(a => [a.amendmentId, a]));
	assert.deepEqual(byId.get(`AMD-${EPIC}-3`), { amendmentId: `AMD-${EPIC}-3`, status: 'approved', type: 'storyBoundary.addStory', storyId: 's7', appliesToHld: true });
	assert.equal(byId.get(`AMD-${EPIC}-4`)?.status, 'pending');
	assert.equal(byId.get(`AMD-${EPIC}-4`)?.appliesToHld, false);
	assert.equal(byId.get(`AMD-${EPIC}-5`)?.status, 'rejected');
	assert.equal(byId.get(`AMD-${EPIC}-6`)?.status, 'approved');
	assert.equal(byId.get(`AMD-${EPIC}-6`)?.appliesToHld, false, 'a malformed approved amendment is not counted');
	assert.equal(list.length, 6);
});

test('a review stamped before its record, a standalone design and malformed fields never throw and invent no currency', () => {
	const current = computeHldEffectiveHash(RUN, []);
	const early = { review: { ...REVIEW.review, reviewedAt: '2026-10-01T00:00:00.000Z' } };
	const records = [
		defRecord(EPIC, ['s1', 's2', 's3', 's4']),
		hldRecord(EPIC, { runId: RUN }),
		lld('s1', current, early),                                              // review older than the record
		lldRecord('cccccccccccccccc', 'S001', { ...REVIEW, standalone: true, hldEffectiveHash: current }),
		lld('s2', current, { hldEffectiveHash: 42, hldAmendmentsApplied: 'none' }), // wrong types
		lld('s3', current, { review: 'not a review' }),                          // no review
		recordFromFile(`LLD-${EPIC}-S003.json`, { meta: { ...REVIEW, createdAt: CREATED, epicHash: EPIC, storyId: 'S003', hldBaseRunId: RUN, hldEffectiveHash: current }, body: {} }),
		planRecord(EPIC, 's4', ['t1'], { ...REVIEW, lldRunId: 'x' }),            // a story with no LLD
	];
	let result: CurrencyPassResult | undefined;
	assert.doesNotThrow(() => { result = run(records).result; });
	assert.ok(result);

	const stamped = currencyOf(result, `LLD-${EPIC}-s1`);
	assert.equal(stamped.reviewCurrency, 'stale');
	assert.match(stamped.basis ?? '', /precedes createdAt/);
	assert.equal(currencyOf(result, 'LLD-cccccccccccccccc-S001').reviewCurrency, 'unknown', 'a standalone design has no HLD to compare');
	assert.equal(currencyOf(result, `LLD-${EPIC}-s2`).reviewCurrency, 'unknown');
	assert.equal(currencyOf(result, `LLD-${EPIC}-s3`).reviewCurrency, null);
	assert.equal(currencyOf(result, `LLD-${EPIC}-S003`).reviewCurrency, 'unknown', 'two LLDs on one story (s3 and S003): none is compared');
	assert.equal(currencyOf(result, `PLAN-${EPIC}-s4`).reviewCurrency, 'unknown');

	// An epic with no HLD record.
	const noHld = run([defRecord(EPIC, ['s1']), lld('s1', current)]).result;
	assert.equal(currencyOf(noHld, `LLD-${EPIC}-s1`).reviewCurrency, 'unknown');
});
