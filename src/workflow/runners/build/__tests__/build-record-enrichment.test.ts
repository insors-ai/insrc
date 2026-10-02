/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * E202609309b72686c:S003 — the BUILD record gains an additive narrative
 * `## Summary` and captures build-cycle feedback into `body.feedback`.
 *
 * Both additions are OMIT-SLOT: a plan-driven record that carries neither a
 * summary nor feedback renders byte-identically to the pre-S003 output (k4). The
 * in-cycle feedback capture reuses the existing append-only appendFeedback writer
 * (no new writer), and persistBuildRecord's mergeWithPrior is untouched, so a
 * re-validate that omits the summary preserves the prior one.
 *
 * Run: npx tsx --test --test-force-exit src/workflow/runners/build/__tests__/build-record-enrichment.test.ts
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { persistBuildRecord, renderBuildRecordMd, type BuildRecord } from '../standalone-record.js';
import { appendFeedback } from '../../../artifacts/provenance/writer.js';
import { ARTIFACTS_DIR } from '../../../storage.js';

const HASH = 'd4e5f6a7b8c9d0e1';
const CREATED = '2026-09-30T00:00:00.000Z';

// ---------------------------------------------------------------------------
// unit — renderBuildRecordMd omit-slot for `## Summary` (ac1, ac3)
// ---------------------------------------------------------------------------

function planRecord(bodyExtra: Partial<BuildRecord['body']>): BuildRecord {
	return {
		meta: { workflow: 'build', standalone: false, epicHash: HASH, storyId: 's1', createdAt: CREATED, updatedAt: CREATED },
		body: { tasks: [{ id: 't1', passed: true }], ...bodyExtra },
	};
}

test('render: a non-empty body.summary -> a `## Summary` section carrying the narrative (ac1)', () => {
	const md = renderBuildRecordMd(planRecord({ summary: 'Added the tag filter and wired it into the query path.' }));
	assert.match(md, /## Summary/);
	assert.match(md, /Added the tag filter and wired it into the query path\./);
});

test('render: an empty / whitespace body.summary -> NO `## Summary` section (omit-slot, ac3)', () => {
	assert.doesNotMatch(renderBuildRecordMd(planRecord({ summary: '' })), /## Summary/);
	assert.doesNotMatch(renderBuildRecordMd(planRecord({ summary: '   ' })), /## Summary/);
});

test('render: a summary XOR feedback -> only the present section renders', () => {
	const withSummary = renderBuildRecordMd(planRecord({ summary: 'A narrative.' }));
	assert.match(withSummary, /## Summary/);
	assert.doesNotMatch(withSummary, /## Feedback/);

	const withFeedback = renderBuildRecordMd(planRecord({ feedback: [{ id: 'f1', author: 'reviewer', timestamp: CREATED, target: { file: 'src/x.ts' }, comment: 'nit' }] }));
	assert.match(withFeedback, /## Feedback/);
	assert.doesNotMatch(withFeedback, /## Summary/);
});

test('render: neither summary nor feedback -> no new sections, byte-identical to the pre-S003 render (ac3/k4)', () => {
	const md = renderBuildRecordMd(planRecord({}));
	assert.doesNotMatch(md, /## Summary/);
	assert.doesNotMatch(md, /## Feedback/);
	// The pre-S003 output for this record is exactly the header + bits + Tasks; the
	// new omit-slots contribute nothing. Freeze that as the golden baseline.
	const expected = [
		'# Build (plan-driven) — Story s1',
		'',
		'**Standalone:** no  ·  **Created:** 2026-09-30T00:00:00.000Z  ·  **Updated:** 2026-09-30T00:00:00.000Z',
		'',
		'## Tasks validated',
		'',
		'- ✓ `t1`',
		'',
	].join('\n');
	assert.equal(md, expected);
});

// ---------------------------------------------------------------------------
// integration — persist + appendFeedback on the persisted BUILD json
// ---------------------------------------------------------------------------

function mkRepoWithDef(): string {
	const repo = mkdtempSync(join(tmpdir(), 'build-enrich-'));
	const dir = join(repo, ARTIFACTS_DIR);
	mkdirSync(dir, { recursive: true });
	// A minimal DEF so persistBuildRecord's buildRecordFolderArgs (standalone:false
	// reads the DEF for the folder anchor) resolves.
	writeFileSync(join(dir, `DEF-${HASH}.json`), JSON.stringify({
		meta: { workflow: 'define', epicHash: HASH, epicSlug: 'enrich-epic', createdAt: CREATED, approvedAt: CREATED },
		body: { problem: 'p', stories: [{ id: 's1', title: 'Story one' }] },
		citations: [],
	}, null, 2));
	return repo;
}

test('persist: a record with body.summary -> the json carries it and the .md renders `## Summary` (ac1)', () => {
	const repo = mkRepoWithDef();
	try {
		const { json, md } = persistBuildRecord(repo, planRecord({ summary: 'Enriched the BUILD record with a summary.' }));
		const rec = JSON.parse(readFileSync(json, 'utf8')) as BuildRecord;
		assert.equal(rec.body.summary, 'Enriched the BUILD record with a summary.');
		assert.match(readFileSync(md, 'utf8'), /## Summary/);
	} finally { rmSync(repo, { recursive: true, force: true }); }
});

test('appendFeedback: build-cycle feedback accretes on the persisted BUILD json and renders `## Feedback` (ac2)', () => {
	const repo = mkRepoWithDef();
	try {
		const { json } = persistBuildRecord(repo, planRecord({ summary: 'A summary.' }));
		const res = appendFeedback({
			artifactPath: json,
			entry: { author: 'reviewer', comment: 'The summary reads well.', target: { file: 'src/workflow/runners/build/standalone-record.ts' } },
		});
		assert.equal(res.total, 1);
		const rec = JSON.parse(readFileSync(json, 'utf8')) as BuildRecord;
		assert.equal(rec.body.feedback?.length, 1);
		assert.equal(rec.body.feedback![0]!.comment, 'The summary reads well.');
		// The renderer shows the captured feedback (and the summary alongside it).
		const md = renderBuildRecordMd(rec);
		assert.match(md, /## Feedback/);
		assert.match(md, /The summary reads well\./);
		assert.match(md, /## Summary/);
	} finally { rmSync(repo, { recursive: true, force: true }); }
});

test('persist upsert: a re-validate that omits body.summary PRESERVES the prior summary', () => {
	const repo = mkRepoWithDef();
	try {
		persistBuildRecord(repo, planRecord({ summary: 'The original narrative.' }));
		// Re-persist WITHOUT a summary (a later per-task validate).
		const { json } = persistBuildRecord(repo, planRecord({ tasks: [{ id: 't2', passed: true }] }));
		const rec = JSON.parse(readFileSync(json, 'utf8')) as BuildRecord;
		assert.equal(rec.body.summary, 'The original narrative.', 'the prior summary survives an omitting re-validate');
	} finally { rmSync(repo, { recursive: true, force: true }); }
});

test('persist: a record with neither summary nor feedback -> the .md has no new sections (ac3/k4)', () => {
	const repo = mkRepoWithDef();
	try {
		const { md } = persistBuildRecord(repo, planRecord({}));
		const text = readFileSync(md, 'utf8');
		assert.doesNotMatch(text, /## Summary/);
		assert.doesNotMatch(text, /## Feedback/);
	} finally { rmSync(repo, { recursive: true, force: true }); }
});
