/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * S002 (provenance/feedback) — BUILD ledger change-log + feedback.
 *
 * Covers: the additive `body.changeLog`/`body.feedback` fields type-check +
 * JSON round-trip (t1); `renderPlanBuildRecordMd` grows a `## Changes` and a
 * `## Feedback` section when present and stays byte-identical when both are
 * absent/empty/legacy (t4); an upsert PRESERVES a prior change-log + an
 * out-of-band appended feedback record across a re-validate that omits them
 * (t6a); `appendFeedback` on a written BUILD json lands on `body.feedback` and
 * surfaces in the render (t6b); a legacy record re-renders byte-identically (t6c).
 *
 * Run: npx tsx --test src/workflow/runners/build/__tests__/provenance-build.test.ts
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, rmSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
	persistBuildRecord,
	renderPlanBuildRecordMd,
	type BuildRecord,
} from '../standalone-record.js';
import { appendFeedback } from '../../../artifacts/provenance/writer.js';
import type { ChangeLog, FeedbackRecord } from '../../../artifacts/provenance/types.js';

const HASH = 'abc123def4567890';

function withRepo(fn: (repo: string) => void): void {
	const repo = mkdtempSync(join(tmpdir(), 'insrc-provenance-build-'));
	mkdirSync(join(repo, '.insrc', 'artifacts'), { recursive: true });
	mkdirSync(join(repo, 'docs', 'builds'), { recursive: true });
	try { fn(repo); } finally { rmSync(repo, { recursive: true, force: true }); }
}

const readJson = (p: string): BuildRecord => JSON.parse(readFileSync(p, 'utf8')) as BuildRecord;

const CHANGELOG: ChangeLog = [
	{ target: { file: 'src/a.ts', version: 'abc123' }, author: 'insrc-build', timestamp: '2026-09-28T00:00:00.000Z' },
];

// ---------------------------------------------------------------------------
// t1 — the additive body fields type-check + JSON round-trip
// ---------------------------------------------------------------------------

test('t1: a BuildRecord carrying changeLog + feedback type-checks and JSON round-trips', () => {
	const feedback: FeedbackRecord = [
		{ id: 'f1', author: 'rev', timestamp: '2026-09-28T02:00:00.000Z', target: { file: 'src/a.ts' }, comment: 'looks good' },
	];
	const rec: BuildRecord = {
		meta: { workflow: 'build', standalone: false, epicHash: HASH, storyId: 's1', createdAt: '2026-01-01T00:00:00.000Z' },
		body: { tasks: [{ id: 't1', passed: true }], changeLog: CHANGELOG, feedback },
	};
	const round = JSON.parse(JSON.stringify(rec)) as BuildRecord;
	assert.deepEqual(round, rec);
	assert.equal(round.body.changeLog!.length, 1);
	assert.equal(round.body.feedback!.length, 1);
});

// ---------------------------------------------------------------------------
// t4 — renderer: present → sections; absent/empty/legacy → byte-identical
// ---------------------------------------------------------------------------

const baseRec: BuildRecord = {
	meta: { workflow: 'build', standalone: false, epicHash: HASH, storyId: 's1', createdAt: '2026-01-01T00:00:00.000Z' },
	body: { tasks: [{ id: 't1', passed: true }] },
};

test('t4: renderPlanBuildRecordMd emits a ## Changes and a ## Feedback section when present', () => {
	const rec: BuildRecord = {
		...baseRec,
		body: {
			...baseRec.body,
			changeLog: CHANGELOG,
			feedback: [{ id: 'f1', author: 'rev', timestamp: '2026-09-28T02:00:00.000Z', target: { file: 'src/a.ts' }, comment: 'tighten error path' }],
		},
	};
	const md = renderPlanBuildRecordMd(rec);
	assert.match(md, /## Changes/);
	assert.match(md, /`src\/a\.ts`/);
	assert.match(md, /## Feedback/);
	assert.match(md, /tighten error path/);
});

test('t4: absent, undefined-valued, and empty-array changeLog/feedback all render byte-identically (omit-slot)', () => {
	const absent   = renderPlanBuildRecordMd(baseRec);
	const undef    = renderPlanBuildRecordMd({ ...baseRec, body: { ...baseRec.body, changeLog: undefined, feedback: undefined } });
	const empty    = renderPlanBuildRecordMd({ ...baseRec, body: { ...baseRec.body, changeLog: [], feedback: [] } });
	assert.equal(undef, absent);
	assert.equal(empty, absent);
	assert.doesNotMatch(absent, /## Changes/);
	assert.doesNotMatch(absent, /## Feedback/);
});

test('t4/t6c: a legacy record (body without the S002 keys) re-renders byte-identically to the base render', () => {
	// A record parsed from legacy JSON has no changeLog/feedback keys at all.
	const legacy = JSON.parse(JSON.stringify(baseRec)) as BuildRecord;
	assert.equal(renderPlanBuildRecordMd(legacy), renderPlanBuildRecordMd(baseRec));
});

// ---------------------------------------------------------------------------
// t6a — upsert PRESERVES a prior change-log + appended feedback across a
//       re-validate whose body omits them (append-only)
// ---------------------------------------------------------------------------

test('t6a: a re-validate that omits changeLog KEEPS the prior changeLog + out-of-band feedback', () => {
	withRepo((repo) => {
		// First validate: persist a record carrying a change-log.
		const { json } = persistBuildRecord(repo, {
			meta: { workflow: 'build', standalone: false, epicHash: HASH, storyId: 's1', createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z' },
			body: { tasks: [{ id: 't1', passed: true }], changeLog: CHANGELOG },
		});
		// Out-of-band: a reviewer appends feedback directly onto the BUILD json.
		appendFeedback({ artifactPath: json, entry: { author: 'rev', comment: 'edge case', target: { file: 'src/a.ts' } } });
		// A LATER re-validate whose body omits changeLog (and knows nothing of feedback).
		persistBuildRecord(repo, {
			meta: { workflow: 'build', standalone: false, epicHash: HASH, storyId: 's1', createdAt: '2026-02-02T00:00:00.000Z', updatedAt: '2026-02-02T00:00:00.000Z' },
			body: { tasks: [{ id: 't2', passed: true }] },
		});
		const rec = readJson(json);
		assert.deepEqual(rec.body.changeLog, CHANGELOG, 'prior change-log preserved across the upsert');
		assert.equal(rec.body.feedback?.length, 1, 'the out-of-band feedback entry survives the upsert');
		assert.equal(rec.body.feedback?.[0]?.comment, 'edge case');
		assert.deepEqual(rec.body.tasks, [{ id: 't1', passed: true }, { id: 't2', passed: true }], 'tasks unioned');
	});
});

// ---------------------------------------------------------------------------
// t6b — appendFeedback integration: lands on body.feedback + surfaces in render
// ---------------------------------------------------------------------------

test('t6b: appendFeedback on a written BUILD json with a source-file target → body.feedback + a rendered ## Feedback section', () => {
	withRepo((repo) => {
		const { json } = persistBuildRecord(repo, {
			meta: { workflow: 'build', standalone: false, epicHash: HASH, storyId: 's1', createdAt: '2026-01-01T00:00:00.000Z' },
			body: { tasks: [{ id: 't1', passed: true }], changeLog: CHANGELOG },
		});
		const res = appendFeedback({ artifactPath: json, entry: { author: 'subho@insors.io', comment: 'add a null guard', target: { file: 'src/a.ts', segment: { startLine: 12, endLine: 14 } }, kind: 'suggestion' } });
		assert.equal(res.total, 1);
		const rec = readJson(json);
		assert.equal(rec.body.feedback?.length, 1);
		assert.equal(rec.body.feedback?.[0]?.target.file, 'src/a.ts');
		const md = renderPlanBuildRecordMd(rec);
		assert.match(md, /## Feedback/);
		assert.match(md, /add a null guard/);
		assert.match(md, /`src\/a\.ts:12-14`/);
		assert.match(md, /`suggestion`/);
	});
});
