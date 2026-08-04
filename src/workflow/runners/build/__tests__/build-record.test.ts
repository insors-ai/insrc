/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Unit tests for the BUILD ledger writer (Story S001 — persist a BUILD ledger
 * for plan-driven builds). Pure filesystem — a tmp repo with .insrc/artifacts +
 * docs/builds; no daemon.
 *
 * Covers persistBuildRecord's upsert-merge semantics (fresh write, task union,
 * createdAt + approval-stamp preservation, fail-open on a corrupt prior), the
 * byte-identical Trivial/standalone regression (persistStandaloneBuildRecord),
 * and end-to-end consumability by the completion gate (approveWorkflowTarget).
 *
 * Run: npx tsx --test src/workflow/runners/build/__tests__/build-record.test.ts
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
	persistBuildRecord,
	persistStandaloneBuildRecord,
	renderStandaloneBuildRecordMd,
	type BuildRecord,
	type StandaloneBuildRecord,
} from '../standalone-record.js';
import { buildArtifactPaths } from '../../../storage.js';
import { approveWorkflowTarget } from '../../../gates.js';

const HASH = 'abc123def4567890';

function withRepo(fn: (repo: string) => void): void {
	const repo = mkdtempSync(join(tmpdir(), 'insrc-build-record-'));
	mkdirSync(join(repo, '.insrc', 'artifacts'), { recursive: true });
	mkdirSync(join(repo, 'docs', 'builds'), { recursive: true });
	try { fn(repo); } finally { rmSync(repo, { recursive: true, force: true }); }
}

const readJson = (p: string): { meta: Record<string, unknown>; body: Record<string, unknown> } =>
	JSON.parse(readFileSync(p, 'utf8')) as { meta: Record<string, unknown>; body: Record<string, unknown> };

const planRec = (tasks: { id: string; passed?: boolean }[], at: string): BuildRecord => ({
	meta: { workflow: 'build', standalone: false, epicHash: HASH, storyId: 's1', createdAt: at, updatedAt: at },
	body: { tasks },
});

// ---------------------------------------------------------------------------
// fresh write
// ---------------------------------------------------------------------------

test('persistBuildRecord writes a fresh standalone:false record at buildArtifactPaths when none exists', () => {
	withRepo((repo) => {
		const { json, md } = persistBuildRecord(repo, planRec([{ id: 't1', passed: true }], '2026-01-01T00:00:00.000Z'));
		assert.equal(json, buildArtifactPaths(repo, HASH, 's1').json);
		const rec = readJson(json);
		assert.equal(rec.meta['standalone'], false);
		assert.equal(rec.meta['workflow'], 'build');
		assert.equal(rec.meta['epicHash'], HASH);
		assert.equal(rec.meta['storyId'], 's1');
		assert.deepEqual(rec.body['tasks'], [{ id: 't1', passed: true }]);
		assert.match(readFileSync(md, 'utf8'), /plan-driven/);
	});
});

// ---------------------------------------------------------------------------
// upsert-merge: union tasks, preserve createdAt, refresh updatedAt
// ---------------------------------------------------------------------------

test('a second validate UNIONS tasks by id, preserves createdAt, refreshes updatedAt (one record, not N)', () => {
	withRepo((repo) => {
		persistBuildRecord(repo, planRec([{ id: 't1', passed: true }], '2026-01-01T00:00:00.000Z'));
		const { json } = persistBuildRecord(repo, planRec([{ id: 't2', passed: false }], '2026-02-02T00:00:00.000Z'));
		const rec = readJson(json);
		assert.deepEqual(rec.body['tasks'], [{ id: 't1', passed: true }, { id: 't2', passed: false }], 'both tasks, unioned');
		assert.equal(rec.meta['createdAt'], '2026-01-01T00:00:00.000Z', 'original createdAt preserved');
		assert.equal(rec.meta['updatedAt'], '2026-02-02T00:00:00.000Z', 'updatedAt refreshed');
	});
});

test('re-validating the same task refreshes its passed without duplicating the row', () => {
	withRepo((repo) => {
		persistBuildRecord(repo, planRec([{ id: 't1', passed: false }], '2026-01-01T00:00:00.000Z'));
		const { json } = persistBuildRecord(repo, planRec([{ id: 't1', passed: true }], '2026-01-02T00:00:00.000Z'));
		assert.deepEqual(readJson(json).body['tasks'], [{ id: 't1', passed: true }], 'single row, passed refreshed');
	});
});

// ---------------------------------------------------------------------------
// preserve approval/rejection stamps across an upsert
// ---------------------------------------------------------------------------

test('an existing meta.approvedAt (+ reviewOverride) is PRESERVED across an upsert (never un-complete a story)', () => {
	withRepo((repo) => {
		const { json } = persistBuildRecord(repo, planRec([{ id: 't1', passed: true }], '2026-01-01T00:00:00.000Z'));
		// Simulate the approval gate stamping the record.
		const stamped = readJson(json);
		stamped.meta['approvedAt'] = '2026-01-05T00:00:00.000Z';
		stamped.meta['reviewOverride'] = { reason: 'manual', at: '2026-01-05T00:00:00.000Z' };
		writeFileSync(json, JSON.stringify(stamped, null, 2) + '\n');
		// A later re-validate must not clobber the completion stamps.
		persistBuildRecord(repo, planRec([{ id: 't2', passed: true }], '2026-01-06T00:00:00.000Z'));
		const rec = readJson(json);
		assert.equal(rec.meta['approvedAt'], '2026-01-05T00:00:00.000Z', 'approvedAt preserved');
		assert.deepEqual(rec.meta['reviewOverride'], { reason: 'manual', at: '2026-01-05T00:00:00.000Z' });
	});
});

// ---------------------------------------------------------------------------
// fail-open on a malformed prior record
// ---------------------------------------------------------------------------

test('a malformed prior record is treated as absent (fail-open fresh write), not a throw', () => {
	withRepo((repo) => {
		const { json } = buildArtifactPaths(repo, HASH, 's1');
		writeFileSync(json, '{ not valid json');
		assert.doesNotThrow(() => persistBuildRecord(repo, planRec([{ id: 't1', passed: true }], '2026-01-01T00:00:00.000Z')));
		const rec = readJson(json);
		assert.equal(rec.meta['standalone'], false);
		assert.deepEqual(rec.body['tasks'], [{ id: 't1', passed: true }], 'fresh record from the current write');
	});
});

// ---------------------------------------------------------------------------
// Trivial/standalone regression — byte-identical output via the thin wrapper
// ---------------------------------------------------------------------------

test('persistStandaloneBuildRecord writes standalone:true json + the SAME md via the thin wrapper (byte-identical)', () => {
	withRepo((repo) => {
		const rec: StandaloneBuildRecord = {
			meta: { workflow: 'build', standalone: true, sizeClass: 'trivial', epicHash: HASH, storyId: 's1', createdAt: '2026-01-01T00:00:00.000Z' },
			body: { focus: 'Add a --json flag to the status subcommand.', producesLld: false },
		};
		const { json, md } = persistStandaloneBuildRecord(repo, rec);
		// json is byte-identical to a plain stringify of the record (no prior, no merge additions).
		assert.equal(readFileSync(json, 'utf8'), JSON.stringify(rec, null, 2) + '\n');
		// md is byte-identical to the unchanged standalone renderer.
		assert.equal(readFileSync(md, 'utf8'), renderStandaloneBuildRecordMd(rec));
		assert.equal(readJson(json).meta['standalone'], true);
	});
});

// ---------------------------------------------------------------------------
// consumability — the persisted plan-driven record satisfies the completion gate
// ---------------------------------------------------------------------------

test('approveWorkflowTarget completes the persisted plan-driven BUILD record (keys on the BUILD- prefix)', () => {
	withRepo((repo) => {
		const { json } = persistBuildRecord(repo, planRec([{ id: 't1', passed: true }], '2026-01-01T00:00:00.000Z'));
		// enforce off → the code-review gate is advisory; completion proceeds + stamps approvedAt.
		const out = approveWorkflowTarget({ repoPath: repo, artifactPath: json }, { enforce: false });
		assert.deepEqual(out.approved.map(a => a.path), [json], 'the BUILD record is approved');
		assert.equal(out.skipped.length, 0);
		assert.equal(typeof readJson(json).meta['approvedAt'], 'string', 'meta.approvedAt stamped');
	});
});
