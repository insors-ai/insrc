/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/** E1 / S004 — the currency pass over fabricated records. */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { computeHldEffectiveHash } from '../../artifacts/lld.js';
import { ARTIFACTS_DIR } from '../../storage.js';
import { deriveCurrency } from '../currency.js';
import { buildWorkItemGraph } from '../graph.js';
import { loadArtifactRecordSet } from '../load.js';
import type { ArtifactCurrency, ArtifactRecord, CurrencyPassResult, ReadonlyStoreFs, WorkItemGraph, WorkItemNode } from '../types.js';
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
	recordFromFile,
	recordSet,
	specRecord,
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
		specRecord('dddddddddddddddd', REVIEW),
		issueRecord('bbbbbbbbbbbbbbbb', { slug: 'nothing' }, REVIEW),
		extRecord(EPIC, 's5', { ...REVIEW, approvedAt: CREATED }),
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

	for (const id of [`DEF-${EPIC}`, `HLD-${EPIC}`, `CR-${EPIC}-s1`, 'SPEC-dddddddddddddddd', 'ISSUE-bbbbbbbbbbbbbbbb', `EXT-${EPIC}-s5`]) {
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

// ---------------------------------------------------------------------------
// t3 — notices
// ---------------------------------------------------------------------------

function holderOf(graph: WorkItemGraph, artifactId: string, kind: WorkItemNode['kind']): WorkItemNode {
	const n = [...graph.items.values()].find(x => x.kind === kind && x.evidenceArtifactIds.includes(artifactId));
	assert.ok(n, `a ${kind} holding ${artifactId}`);
	return n;
}

test('an extension story stays in the view and its extension newer than the epic framing is reported', () => {
	const APPROVED = { approvedAt: '2026-10-08T13:00:00.000Z', createdAt: '2026-10-08T13:00:00.000Z' };
	// An older framing that does not list the extension's story.
	const old = run([defRecord(EPIC, ['s1']), extRecord(EPIC, 's9', APPROVED)]);
	const story = holderOf(old.graph, `EXT-${EPIC}-s9`, 'story');
	const notice = old.result.notices.find(n => n.code === 'base-predates-extension');
	assert.ok(notice, 'a base-predates-extension notice');
	assert.deepEqual(notice.artifactIds, [`DEF-${EPIC}`, `EXT-${EPIC}-s9`]);
	assert.ok(notice.itemIds.includes(story.id), 'it names the added story');
	assert.equal(notice.attention, false);

	// The real shape: the extend path appended s8 to the Define, which predates the extension.
	const real = run([defRecord(EPIC, ['s1', 's8']), extRecord(EPIC, 's8', APPROVED)]);
	assert.ok(holderOf(real.graph, `EXT-${EPIC}-s8`, 'story'), 'the added story is present');
	assert.equal(real.result.notices.some(n => n.code === 'base-predates-extension'), false, 'a Define that lists the story raises nothing');

	// An extension not yet accepted raises nothing.
	const pending = run([defRecord(EPIC, ['s1']), extRecord(EPIC, 's9')]);
	assert.equal(pending.result.notices.some(n => n.code === 'base-predates-extension'), false);
});

test('an item no record gives a title stays in the view with an incomplete-evidence notice', () => {
	const { graph, result } = run([buildRecord('eeeeeeeeeeeeeeee', 'S001', [{ id: 't1', passed: true }])]);
	const story = holderOf(graph, 'BUILD-eeeeeeeeeeeeeeee-S001', 'story');
	assert.equal(story.title, null);
	const notice = result.notices.find(n => n.code === 'incomplete-evidence' && n.itemIds.includes(story.id));
	assert.ok(notice, 'an incomplete-evidence notice on the untitled story');
	assert.deepEqual(notice.artifactIds, ['BUILD-eeeeeeeeeeeeeeee-S001']);
	assert.match(notice.message, /no record gives .* a title/);
});

test('the real-shape fixtures give every record a currency entry, deterministically', () => {
	const records = realRecords();
	const first = run(records).result;
	const second = run(records).result;
	assert.equal(first.artifacts.size, records.length);
	assert.deepEqual([...first.artifacts.entries()], [...second.artifacts.entries()]);
	assert.deepEqual([...first.amendments.entries()], [...second.amendments.entries()]);
	assert.deepEqual(first.notices, second.notices);
	assert.equal(first.notices.some(n => n.code === 'record-unreadable'), false, 'the pass never raises record-unreadable');
});

const BAD_FILE = `LLD-${EPIC}-s2.json`;

/** A store of JSON files (strings written as-is) in a fresh temporary repo. */
function storeRepo(files: Readonly<Record<string, unknown>>): string {
	const repo = mkdtempSync(join(tmpdir(), 'insrc-delivery-currency-'));
	const dir = join(repo, ARTIFACTS_DIR);
	mkdirSync(dir, { recursive: true });
	for (const [name, value] of Object.entries(files)) writeFileSync(join(dir, name), typeof value === 'string' ? value : JSON.stringify(value, null, 2));
	return repo;
}

/** Path, size, mtime and content hash of every file under root. */
function snapshotTree(root: string): string[] {
	const out: string[] = [];
	const walk = (dir: string): void => {
		for (const name of readdirSync(dir).sort()) {
			const p = join(dir, name);
			const st = statSync(p);
			if (st.isDirectory()) { out.push(`${p}/`); walk(p); continue; }
			out.push(`${p} ${st.size} ${st.mtimeMs} ${createHash('sha256').update(readFileSync(p)).digest('hex')}`);
		}
	};
	walk(root);
	return out;
}

const STORE_FILES: Readonly<Record<string, unknown>> = {
	[`DEF-${EPIC}.json`]:      { meta: { epicHash: EPIC, createdAt: CREATED, epicCreatedAt: CREATED, epicSlug: 'e1' }, body: { stories: [{ id: 's1', title: 'One' }, { id: 's2', title: 'Two' }, { id: 's3', title: 'Three' }] } },
	[`LLD-${EPIC}-s1.json`]:   { meta: { epicHash: EPIC, storyId: 's1', createdAt: CREATED, ...REVIEW }, body: {} },
	[`LLD-${EPIC}-s3.json`]:   { meta: { epicHash: EPIC, storyId: 's3', createdAt: CREATED, ...REVIEW }, body: {} },
	[`LLD-${EPIC}-S003.json`]: { meta: { epicHash: EPIC, storyId: 'S003', createdAt: CREATED, ...REVIEW }, body: {} },
	[BAD_FILE]:                '{ "meta": { "epicHash": ',
};

test('a malformed file leaves every other item in place and is named with the coverage it leaves unknown', () => {
	const dir = join('/repo', ARTIFACTS_DIR);
	const files = new Map(Object.entries(STORE_FILES).map(([name, v]) => [join(dir, name), typeof v === 'string' ? v : JSON.stringify(v)]));
	const fs: ReadonlyStoreFs = {
		exists:   p => p === dir || files.has(p),
		listDir:  () => Object.keys(STORE_FILES),
		readFile: p => { const v = files.get(p); if (v === undefined) throw new Error(`ENOENT ${p}`); return v; },
	};
	const set = loadArtifactRecordSet('/repo', fs, () => '2026-10-08T00:00:00.000Z');
	assert.deepEqual(set.failures.map(f => f.fileName), [BAD_FILE]);

	const clean = buildWorkItemGraph(recordSet(set.records));
	const graph = buildWorkItemGraph(set);
	const result = deriveCurrency(graph, set);

	assert.deepEqual([...graph.items.keys()], [...clean.items.keys()], 'every unaffected item is present');
	const s2 = [...graph.items.values()].find(n => n.kind === 'story' && n.sourceIds.includes('s2'));
	assert.ok(s2, 'the story the bad file belongs to is still in the view (from the Define)');

	const coverage = result.notices.filter(n => n.code === 'incomplete-evidence' && n.fileNames.includes(BAD_FILE));
	assert.equal(coverage.length, 1);
	assert.deepEqual(coverage[0]?.itemIds, [s2.id], 'it names the item whose coverage is unknown');
	assert.match(coverage[0]?.message ?? '', /invalid-json/);
	assert.match(coverage[0]?.message ?? '', /LLD record of work item aaaaaaaaaaaaaaaa story s2/);

	assert.equal(result.notices.some(n => n.code === 'record-unreadable'), false, 'this pass never raises record-unreadable');
	const unreadable = graph.notices.filter(n => n.code === 'record-unreadable');
	assert.equal(unreadable.length, 1, 'the graph builder raises exactly one (ISSUE-34b6a247)');
	assert.deepEqual(unreadable[0]?.fileNames, [BAD_FILE]);
	assert.equal(unreadable[0]?.attention, true);
});

test('producing the currency annotation changes no file in the artifact store', () => {
	const repo = storeRepo(STORE_FILES);
	try {
		const before = snapshotTree(repo);
		const set = loadArtifactRecordSet(repo);
		const result = deriveCurrency(buildWorkItemGraph(set), set);
		assert.equal(set.failures.length, 1, 'the malformed file is among the inputs');
		assert.ok(result.notices.some(n => n.message.includes('several LLD records')), 'the s3 / S003 pair is among the inputs');
		assert.deepEqual(snapshotTree(repo), before);
	} finally {
		rmSync(repo, { recursive: true, force: true });
	}
});

test('the staleness hash uses each amendment record\'s own id, and a missing hldBaseRunId is not called a re-run', () => {
	// A hand-renamed AMD file: its file stem (artifactId) differs from the id it records.
	const renamed = recordFromFile(`AMD-${EPIC}-7.json`, {
		id: `AMD-${EPIC}-3`, epicHash: EPIC, epicSlug: 'e1', hldBaseRunId: RUN, rationale: 'r', citations: [], proposedBy: { role: 'controller' },
		proposedAt: CREATED, status: 'approved', approvedAt: '2026-10-01T00:00:00.000Z', amendment: { type: 'storyBoundary.addStory', storyId: 's7' },
	});
	const byRecordedId = computeHldEffectiveHash(RUN, [`AMD-${EPIC}-3`]);
	const { result } = run([
		defRecord(EPIC, ['s1', 's2']),
		hldRecord(EPIC, { runId: RUN }),
		renamed,
		lld('s1', byRecordedId, { hldAmendmentsApplied: [`AMD-${EPIC}-3`] }),
		lld('s2', 'some-other-hash', { hldBaseRunId: undefined }),
	]);
	assert.equal(currencyOf(result, `LLD-${EPIC}-s1`).reviewCurrency, 'current', 'hashed by the recorded id, as the scanner hashes it');
	const noBase = currencyOf(result, `LLD-${EPIC}-s2`);
	assert.equal(noBase.reviewCurrency, 'stale', 'the hash mismatch still makes it stale');
	assert.doesNotMatch(noBase.basis ?? '', /hld-rerun/, 'no recorded hldBaseRunId, so no re-run is claimed');
});
