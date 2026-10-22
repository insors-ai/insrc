/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * S002 (provenance) — BUILD ledger change-log.
 *
 * Covers: the additive `body.changeLog` field type-checks + JSON round-trips
 * (t1); `renderBuildRecordMd` grows a `## Changes` section when present and
 * stays byte-identical when it is absent/empty/legacy (t4); an upsert PRESERVES
 * a prior change-log across a re-validate that omits it (t6a); a legacy record
 * re-renders byte-identically (t6c). Feedback is the sidecar's, not the body's.
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
	renderBuildRecordMd,
	type BuildRecord,
} from '../standalone-record.js';
import type { FileChangeLog } from '../../../artifacts/provenance/types.js';

const HASH = 'abc123def4567890';

async function withRepo(fn: (repo: string) => void | Promise<void>): Promise<void> {
	const repo = mkdtempSync(join(tmpdir(), 'insrc-provenance-build-'));
	mkdirSync(join(repo, '.insrc', 'artifacts'), { recursive: true });
	mkdirSync(join(repo, 'docs', 'builds'), { recursive: true });
	try { await fn(repo); } finally { rmSync(repo, { recursive: true, force: true }); }
}

const readJson = (p: string): BuildRecord => JSON.parse(readFileSync(p, 'utf8')) as BuildRecord;

const CHANGELOG: FileChangeLog = [
	{ target: { file: 'src/a.ts', version: 'abc123' }, author: 'insrc-build', timestamp: '2026-09-28T00:00:00.000Z' },
];

// ---------------------------------------------------------------------------
// t1 — the additive body fields type-check + JSON round-trip
// ---------------------------------------------------------------------------

test('t1: a BuildRecord carrying changeLog type-checks and JSON round-trips', () => {
	const rec: BuildRecord = {
		meta: { workflow: 'build', standalone: false, epicHash: HASH, storyId: 's1', createdAt: '2026-01-01T00:00:00.000Z' },
		body: { tasks: [{ id: 't1', passed: true }], changeLog: CHANGELOG },
	};
	const round = JSON.parse(JSON.stringify(rec)) as BuildRecord;
	assert.deepEqual(round, rec);
	assert.equal(round.body.changeLog!.length, 1);
});

// ---------------------------------------------------------------------------
// t4 — renderer: present → sections; absent/empty/legacy → byte-identical
// ---------------------------------------------------------------------------

const baseRec: BuildRecord = {
	meta: { workflow: 'build', standalone: false, epicHash: HASH, storyId: 's1', createdAt: '2026-01-01T00:00:00.000Z' },
	body: { tasks: [{ id: 't1', passed: true }] },
};

test('t4: renderBuildRecordMd emits a ## Changes section when present', () => {
	const rec: BuildRecord = {
		...baseRec,
		body: {
			...baseRec.body,
			changeLog: CHANGELOG,
		},
	};
	const md = renderBuildRecordMd(rec);
	assert.match(md, /## Changes/);
	assert.match(md, /`src\/a\.ts`/);
});

test('t4: absent, undefined-valued, and empty-array changeLog/feedback all render byte-identically (omit-slot)', () => {
	const absent   = renderBuildRecordMd(baseRec);
	const undef    = renderBuildRecordMd({ ...baseRec, body: { ...baseRec.body, changeLog: undefined } });
	const empty    = renderBuildRecordMd({ ...baseRec, body: { ...baseRec.body, changeLog: [] } });
	assert.equal(undef, absent);
	assert.equal(empty, absent);
	assert.doesNotMatch(absent, /## Changes/);
});

test('t4/t6c: a legacy record (body without the S002 keys) re-renders byte-identically to the base render', () => {
	// A record parsed from legacy JSON has no changeLog/feedback keys at all.
	const legacy = JSON.parse(JSON.stringify(baseRec)) as BuildRecord;
	assert.equal(renderBuildRecordMd(legacy), renderBuildRecordMd(baseRec));
});

// ---------------------------------------------------------------------------
// t6a — upsert PRESERVES a prior change-log + appended feedback across a
//       re-validate whose body omits them (append-only)
// ---------------------------------------------------------------------------

test('t6a: a re-validate that omits changeLog KEEPS the prior changeLog', async () => {
	await withRepo(async (repo) => {
		// First validate: persist a record carrying a change-log.
		const { json } = await persistBuildRecord(repo, {
			meta: { workflow: 'build', standalone: false, epicHash: HASH, storyId: 's1', createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z' },
			body: { tasks: [{ id: 't1', passed: true }], changeLog: CHANGELOG },
		});
		// A LATER re-validate whose body omits changeLog.
		await persistBuildRecord(repo, {
			meta: { workflow: 'build', standalone: false, epicHash: HASH, storyId: 's1', createdAt: '2026-02-02T00:00:00.000Z', updatedAt: '2026-02-02T00:00:00.000Z' },
			body: { tasks: [{ id: 't2', passed: true }] },
		});
		const rec = readJson(json);
		assert.deepEqual(rec.body.changeLog, CHANGELOG, 'prior change-log preserved across the upsert');
		assert.deepEqual(rec.body.tasks, [{ id: 't1', passed: true }, { id: 't2', passed: true }], 'tasks unioned');
	});
});

