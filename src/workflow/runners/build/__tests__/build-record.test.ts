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
import { artifactJsonPath, buildArtifactId } from '../../../storage.js';
import { approveWorkflowTarget } from '../../../gates.js';

const HASH = 'abc123def4567890';

async function withRepo(fn: (repo: string) => void | Promise<void>): Promise<void> {
	const repo = mkdtempSync(join(tmpdir(), 'insrc-build-record-'));
	mkdirSync(join(repo, '.insrc', 'artifacts'), { recursive: true });
	mkdirSync(join(repo, 'docs', 'builds'), { recursive: true });
	try { await fn(repo); } finally { rmSync(repo, { recursive: true, force: true }); }
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

test('persistBuildRecord writes a fresh standalone:false record at buildArtifactPaths when none exists', async () => {
	await withRepo(async (repo) => {
		const { json, md } = persistBuildRecord(repo, planRec([{ id: 't1', passed: true }], '2026-01-01T00:00:00.000Z'));
		assert.equal(json, artifactJsonPath(repo, buildArtifactId(HASH, 's1')));
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

test('a second validate UNIONS tasks by id, preserves createdAt, refreshes updatedAt (one record, not N)', async () => {
	await withRepo(async (repo) => {
		persistBuildRecord(repo, planRec([{ id: 't1', passed: true }], '2026-01-01T00:00:00.000Z'));
		const { json } = persistBuildRecord(repo, planRec([{ id: 't2', passed: false }], '2026-02-02T00:00:00.000Z'));
		const rec = readJson(json);
		assert.deepEqual(rec.body['tasks'], [{ id: 't1', passed: true }, { id: 't2', passed: false }], 'both tasks, unioned');
		assert.equal(rec.meta['createdAt'], '2026-01-01T00:00:00.000Z', 'original createdAt preserved');
		assert.equal(rec.meta['updatedAt'], '2026-02-02T00:00:00.000Z', 'updatedAt refreshed');
	});
});

test('re-validating the same task refreshes its passed without duplicating the row', async () => {
	await withRepo(async (repo) => {
		persistBuildRecord(repo, planRec([{ id: 't1', passed: false }], '2026-01-01T00:00:00.000Z'));
		const { json } = persistBuildRecord(repo, planRec([{ id: 't1', passed: true }], '2026-01-02T00:00:00.000Z'));
		assert.deepEqual(readJson(json).body['tasks'], [{ id: 't1', passed: true }], 'single row, passed refreshed');
	});
});

// ---------------------------------------------------------------------------
// preserve approval/rejection stamps across an upsert
// ---------------------------------------------------------------------------

test('an existing meta.approvedAt (+ reviewOverride) is PRESERVED across an upsert (never un-complete a story)', async () => {
	await withRepo(async (repo) => {
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

test('a malformed prior record is treated as absent (fail-open fresh write), not a throw', async () => {
	await withRepo(async (repo) => {
		const json = artifactJsonPath(repo, buildArtifactId(HASH, 's1'));
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

test('persistStandaloneBuildRecord writes standalone:true json + the SAME md via the thin wrapper (byte-identical)', async () => {
	await withRepo(async (repo) => {
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

test('approveWorkflowTarget completes the persisted plan-driven BUILD record (keys on the BUILD- prefix)', async () => {
	await withRepo(async (repo) => {
		const { json } = persistBuildRecord(repo, planRec([{ id: 't1', passed: true }], '2026-01-01T00:00:00.000Z'));
		// enforce off → the code-review gate is advisory; completion proceeds + stamps approvedAt.
		const out = await approveWorkflowTarget({ repoPath: repo, artifactPath: json }, { enforce: false });
		assert.deepEqual(out.approved.map(a => a.path), [json], 'the BUILD record is approved');
		assert.equal(out.skipped.length, 0);
		assert.equal(typeof readJson(json).meta['approvedAt'], 'string', 'meta.approvedAt stamped');
	});
});

test('S002 regression: a Trivial-standalone re-run with a fresh createdAt keeps the SAME md folder (folder anchored on the PRESERVED createdAt, so BUILD + CR never split)', async () => {
	await withRepo(async repo => {
		// First build — no upstream LLD (Trivial), so the folder E<date> anchor is
		// the record's OWN createdAt.
		const first: StandaloneBuildRecord = {
			meta: { workflow: 'build', standalone: true, sizeClass: 'trivial', epicHash: HASH, storyId: 's1', createdAt: '2026-01-01T23:59:59.000Z' },
			body: { focus: 'f', producesLld: false },
		};
		const p1 = persistStandaloneBuildRecord(repo, first);
		// A re-run the next UTC day mints a FRESH createdAt (as implement.ts does).
		const rerun: StandaloneBuildRecord = {
			...first,
			meta: { ...first.meta, createdAt: '2026-01-02T00:00:01.000Z' },
		};
		const p2 = persistStandaloneBuildRecord(repo, rerun);
		// The merge preserves the original createdAt, and the folder is keyed on the
		// merged record — so the md path is unchanged (no orphaned day-2 folder).
		assert.equal(p2.md, p1.md, 'the re-run resolves to the same md folder as the first build');
		assert.match(p1.md, /\/docs\/standalone\/[^/]*E20260101[^/]*\/S001\/BUILD\.md$/, 'folder E<date> is the ORIGINAL createdAt day (2026-01-01), not the re-run day');
		assert.equal(readJson(p1.json).meta['createdAt'], '2026-01-01T23:59:59.000Z', 'persisted createdAt is preserved across the upsert');
	});
});

// ---------------------------------------------------------------------------
// ISSUE-013e816250937aa5 — the upsert must not DELETE meta the record already
// carried. Two opposite rules live in this merge and both are pinned here:
//   general  : the new write wins on fields it SUPPLIES, prior survives on
//              fields it OMITS (same rule body already followed)
//   exception: createdAt + the four completion/rejection stamps are PRIOR-wins,
//              so a finished Story can never be un-finished
// ---------------------------------------------------------------------------

/** The implement-phase write: the only producer of sizeClass + triageRationale. */
const standaloneRec = (at: string): BuildRecord => ({
	meta: {
		workflow: 'build', standalone: true, sizeClass: 'trivial',
		triageRationale: 'one-line mechanical edit',
		epicHash: HASH, storyId: 's1', createdAt: at,
	},
	body: { focus: 'Add a --json flag to the status subcommand.', producesLld: false },
});

test('a prior-only meta field SURVIVES a later write that omits it (sizeClass + triageRationale were silently deleted)', async () => {
	await withRepo((repo) => {
		persistBuildRecord(repo, standaloneRec('2026-01-01T00:00:00.000Z'));
		// The validate write, verbatim in shape: it mentions neither field.
		persistBuildRecord(repo, planRec([{ id: 's1', passed: true }], '2026-02-02T00:00:00.000Z'));

		const rec = readJson(artifactJsonPath(repo, buildArtifactId(HASH, 's1')));
		assert.equal(rec.meta['sizeClass'], 'trivial', 'sizeClass survives a write that omits it');
		assert.equal(rec.meta['triageRationale'], 'one-line mechanical edit', 'triageRationale survives too');
	});
});

test('the new write still WINS on a meta field it DOES supply (preservation must not become prior-always-wins)', async () => {
	await withRepo((repo) => {
		persistBuildRecord(repo, standaloneRec('2026-01-01T00:00:00.000Z'));
		persistBuildRecord(repo, planRec([{ id: 's1', passed: true }], '2026-02-02T00:00:00.000Z'));

		const rec = readJson(artifactJsonPath(repo, buildArtifactId(HASH, 's1')));
		// standalone: prior true, new write supplies false → the NEW value wins.
		assert.equal(rec.meta['standalone'], false, 'a supplied field takes the new value');
		assert.equal(rec.meta['updatedAt'], '2026-02-02T00:00:00.000Z', 'updatedAt refreshes');
	});
});

test('the PRIOR-wins exceptions are untouched: createdAt and all four completion/rejection stamps still beat the new write', async () => {
	await withRepo((repo) => {
		const json = artifactJsonPath(repo, buildArtifactId(HASH, 's1'));
		persistBuildRecord(repo, {
			meta: {
				...standaloneRec('2026-01-01T00:00:00.000Z').meta,
				approvedAt: '2026-01-05T00:00:00.000Z',
				rejectedAt: '2026-01-06T00:00:00.000Z',
				rejectReason: 'the original reason',
				reviewOverride: { reason: 'the original override', at: '2026-01-07T00:00:00.000Z' },
			},
			body: standaloneRec('2026-01-01T00:00:00.000Z').body,
		});
		// A later write that tries to overwrite every prior-wins field.
		persistBuildRecord(repo, {
			meta: {
				workflow: 'build', standalone: false, epicHash: HASH, storyId: 's1',
				createdAt: '2026-09-09T00:00:00.000Z', updatedAt: '2026-09-09T00:00:00.000Z',
				approvedAt: '2026-09-09T00:00:00.000Z',
				rejectedAt: '2026-09-09T00:00:00.000Z',
				rejectReason: 'a clobbering reason',
				reviewOverride: { reason: 'a clobbering override', at: '2026-09-09T00:00:00.000Z' },
			},
			body: { tasks: [{ id: 's1', passed: true }] },
		});

		const m = readJson(json).meta;
		assert.equal(m['createdAt'], '2026-01-01T00:00:00.000Z', 'createdAt stays prior (the md folder anchor depends on it)');
		assert.equal(m['approvedAt'], '2026-01-05T00:00:00.000Z', 'approvedAt stays prior — never un-complete a story');
		assert.equal(m['rejectedAt'], '2026-01-06T00:00:00.000Z');
		assert.equal(m['rejectReason'], 'the original reason');
		assert.deepEqual(m['reviewOverride'], { reason: 'the original override', at: '2026-01-07T00:00:00.000Z' });
	});
});

test('BYTE-IDENTITY: a new write that supplies every field the record already carried produces the SAME json and md as a fresh write', async () => {
	await withRepo((repo) => {
		const rec = planRec([{ id: 't1', passed: true }], '2026-03-03T00:00:00.000Z');
		// Fresh write, captured.
		const first = persistBuildRecord(repo, rec);
		const freshJson = readFileSync(first.json, 'utf8');
		const freshMd   = readFileSync(first.md, 'utf8');
		// Re-write the IDENTICAL record — now going through the merge path.
		const second = persistBuildRecord(repo, rec);
		assert.equal(readFileSync(second.json, 'utf8'), freshJson, 'json is byte-identical through the merge');
		assert.equal(readFileSync(second.md, 'utf8'), freshMd, 'md is byte-identical through the merge');
	});
});

test('a meta field can no longer be cleared by OMITTING it — the documented trade-off, pinned so it is a decision and not a surprise', async () => {
	await withRepo((repo) => {
		persistBuildRecord(repo, standaloneRec('2026-01-01T00:00:00.000Z'));
		persistBuildRecord(repo, planRec([{ id: 's1', passed: true }], '2026-02-02T00:00:00.000Z'));
		const rec = readJson(artifactJsonPath(repo, buildArtifactId(HASH, 's1')));
		// This is the cost of the fix, stated as an assertion: omission no longer
		// deletes. A future caller needing to genuinely unset a field must do it
		// explicitly rather than by leaving the key out.
		assert.ok('sizeClass' in rec.meta, 'omission does not delete — clearing must be explicit');
	});
});
