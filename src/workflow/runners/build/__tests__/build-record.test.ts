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
import { execFileSync } from 'node:child_process';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
	persistBuildRecord,
	persistStandaloneBuildRecord,
	renderBuildRecordMd,
	renderStandaloneBuildRecordMd,
	type BuildRecord,
	type StandaloneBuildRecord,
} from '../standalone-record.js';
import { artifactJsonPath, buildArtifactId } from '../../../storage.js';
import { approveWorkflowTarget } from '../../../gates.js';
import {
	WELL_FORMED_STANDALONE_RECORD, WELL_FORMED_STANDALONE_GOLDEN,
	PLAN_DRIVEN_RECORD, PLAN_DRIVEN_GOLDEN,
	PATHOLOGICAL_RECORD, PATHOLOGICAL_GOLDEN,
} from './fixtures/build-record-goldens.js';

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

/** Frozen render of the record the thin-wrapper test constructs below, captured
 *  on unmodified HEAD before the t8 convergence. Deliberately NOT computed from
 *  the renderer — see the comment at the assertion. */
const THIN_WRAPPER_GOLDEN =
	'# Build (standalone trivial) \u2014 Story s1\n' +
	'\n' +
	'**Size class:** trivial  \u00b7  **Standalone:** yes  \u00b7  **Created:** 2026-01-01T00:00:00.000Z\n' +
	'\n' +
	'## Scope\n' +
	'\n' +
	'Add a --json flag to the status subcommand.\n';

test('persistStandaloneBuildRecord writes standalone:true json + the SAME md via the thin wrapper (byte-identical)', async () => {
	await withRepo(async (repo) => {
		const rec: StandaloneBuildRecord = {
			meta: { workflow: 'build', standalone: true, sizeClass: 'trivial', epicHash: HASH, storyId: 's1', createdAt: '2026-01-01T00:00:00.000Z' },
			body: { focus: 'Add a --json flag to the status subcommand.', producesLld: false },
		};
		const { json, md } = persistStandaloneBuildRecord(repo, rec);
		// json is byte-identical to a plain stringify of the record (no prior, no merge additions).
		assert.equal(readFileSync(json, 'utf8'), JSON.stringify(rec, null, 2) + '\n');
		// md is byte-identical to a FROZEN expectation.
		//
		// This assertion used to read `renderStandaloneBuildRecordMd(rec)`. That was
		// vacuous-in-waiting: t8 turns that function into a delegating shim over the
		// converged renderer, and persistBuildRecord writes THROUGH the converged
		// renderer — so both operands would become the same function applied to the
		// same record, and the check would pass for any output whatsoever, including
		// one that changed every byte. Frozen string instead, so the comparison has
		// an independent right-hand side. (t2, ISSUE-93081bff91ae5108.)
		assert.equal(readFileSync(md, 'utf8'), THIN_WRAPPER_GOLDEN);
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

// S001/t9 — `meta.standalone` became OPTIONAL so the SHARED validate persist can
// stop asserting a route it cannot determine. That makes the general merge rule
// above load-bearing in a new way: the carry-forward is now the ONLY thing that
// keeps a standalone record standalone through validation, and the md FOLDER is
// keyed on the merged value. Both halves are pinned here.

test('t9: a write that OMITS standalone keeps the prior true (the carry-forward the shared validate persist now relies on)', async () => {
	await withRepo((repo) => {
		persistBuildRecord(repo, standaloneRec('2026-01-01T00:00:00.000Z'));
		// The post-t9 validate write, verbatim in shape: no `standalone` key at all.
		const { meta: _drop, ...rest } = planRec([{ id: 's1', passed: true }], '2026-02-02T00:00:00.000Z');
		const omitting: BuildRecord = {
			...rest,
			meta: {
				workflow: 'build', epicHash: HASH, storyId: 's1',
				createdAt: '2026-02-02T00:00:00.000Z', updatedAt: '2026-02-02T00:00:00.000Z',
			},
		};
		const paths = persistBuildRecord(repo, omitting);

		const rec = readJson(artifactJsonPath(repo, buildArtifactId(HASH, 's1')));
		assert.equal(rec.meta['standalone'], true,
			'an OMITTED standalone leaves the prior value standing (counterpart to the supplied-wins test above)');
		// The folder follows the MERGED value, not the write's. Pre-t9 the write
		// supplied `false` and this record MOVED to docs/epics/ mid-Story.
		assert.match(paths.md, /\/docs\/standalone\//,
			'the md stays under docs/standalone/ — the record does not change folders at validation');
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

// ---------------------------------------------------------------------------
// BYTE-IDENTITY goldens — ISSUE-93081bff91ae5108 / S001 / t2
//
// Three REAL committed BUILD records, with the markdown they render TODAY frozen
// before the t8 convergence. Real rather than constructed on purpose: a fixture
// built from the new understanding would agree with the fix by construction.
//
//   goldens 1 + 2  MUST NOT change at t8 — convergence must preserve them
//   golden 3       IS EXPECTED TO CHANGE — it records a defect
//
// See fixtures/build-record-goldens.ts for why golden 3 is a defect.
// ---------------------------------------------------------------------------

test('BYTE-IDENTITY golden 1: a real pre-fix well-formed standalone record renders exactly its captured markdown', () => {
	const md = renderStandaloneBuildRecordMd(WELL_FORMED_STANDALONE_RECORD as unknown as StandaloneBuildRecord);
	assert.equal(md, WELL_FORMED_STANDALONE_GOLDEN,
		'MUST NOT change at t8 — a standalone record with focus + triageRationale must survive the convergence byte-for-byte');
});

test('BYTE-IDENTITY golden 2: a real pre-fix plan-driven record renders exactly its captured markdown', () => {
	const md = renderBuildRecordMd(PLAN_DRIVEN_RECORD);
	assert.equal(md, PLAN_DRIVEN_GOLDEN,
		'MUST NOT change at t8 — exercises title, created/updated, Summary, Tasks validated and Changes in one record');
});

test('BYTE-IDENTITY golden 3 (PATHOLOGICAL): REPAIRED at t8 — every defect t2 catalogued is gone, and nothing else moved', () => {
	const md = renderBuildRecordMd(PATHOLOGICAL_RECORD);
	assert.equal(md, PATHOLOGICAL_GOLDEN, 'the reviewed post-repair golden');

	// INVERTED from t2, defect by defect, so the repair is itemised rather than
	// resting on one opaque blob comparison.
	assert.doesNotMatch(md, /undefined/,                 'DEFECTS 1+2: the word appears NOWHERE — neither title nor size-class line');
	assert.match(md, /^# Build \(standalone\) — Story S001$/m, 'the absent-sizeClass case is DEFINED: a well-formed heading');
	assert.doesNotMatch(md, /\*\*Size class:\*\*/,        'the size-class line is OMITTED rather than printed empty');
	assert.match(md, /\*\*Commit:\*\* feba6f0/,            'DEFECT 3b REPAIRED: body.commit now renders');
	assert.match(md, /## Tasks validated/,               'DEFECT 3c REPAIRED: the six passing tasks now render');
	assert.equal((md.match(/- ✓ `t\d`/g) ?? []).length, 6, 'all six, not a subset');
	assert.doesNotMatch(md, /## Scope/,                  'DEFECT 3a REPAIRED: no vacuous Scope heading — body.focus is genuinely absent');
	// Still true of the record itself: the content was always there.
	assert.equal(PATHOLOGICAL_RECORD.body.commit, 'feba6f0');
	assert.equal(PATHOLOGICAL_RECORD.body.tasks?.length, 6);
});

test('FORWARD COMPAT: a record written entirely before this Story still parses, merges via mergeWithPrior and renders without error', async () => {
	await withRepo((repo) => {
		const json = artifactJsonPath(repo, buildArtifactId(HASH, 's1'));
		// Seed the real pre-fix plan-driven record as the PRIOR, under this repo's ids.
		const prior = {
			...PLAN_DRIVEN_RECORD,
			meta: { ...PLAN_DRIVEN_RECORD.meta, epicHash: HASH, storyId: 's1' },
		} as BuildRecord;
		writeFileSync(json, JSON.stringify(prior, null, 2) + '\n');
		// A later validate write must merge onto it without throwing...
		assert.doesNotThrow(() => persistBuildRecord(repo, planRec([{ id: 't3', passed: true }], '2026-10-10T00:00:00.000Z')));
		const merged = readJson(json);
		// ...preserving what the old record carried (summary + changeLog are body
		// keys; sizeClass-style meta retention is covered by the ISSUE-013e8162 tests).
		assert.equal(typeof merged.body['summary'], 'string', 'the pre-existing summary survives');
		assert.ok(Array.isArray(merged.body['changeLog']), 'the pre-existing changeLog survives');
		assert.equal((merged.body['tasks'] as { id: string }[]).length, 3, 'tasks union: 2 prior + 1 new');
	});
});

// ---------------------------------------------------------------------------
// t7 (ISSUE-93081bff91ae5108 / S001) — body.commit + body.summary get producers.
//
// Both fields were DECLARED and already RENDERED (standalone-record.ts:142, :150)
// but written by none of the three body writers — two dead branches. The evidence
// that the gap was felt rather than theoretical: three tracked records carry
// body.commit (972bf31d, c90f3fe6, be8708a9) with no producer in the codebase, so
// they were back-filled by hand.
//
// RENDER assertions here are PLAN-DRIVEN only: the standalone renderer emits
// neither section until t8, so an unscoped check would fail t7 for a reason t7
// cannot fix. Standalone-route rendering is t8's.
// ---------------------------------------------------------------------------

/** A throwaway GIT repo (so HEAD resolves) with the artifacts dir ready. */
async function withGitRepo(fn: (repo: string, head: string) => void | Promise<void>): Promise<void> {
	const repo = mkdtempSync(join(tmpdir(), 'insrc-t7-'));
	const git = (...a: string[]): string => execFileSync('git', a, { cwd: repo, encoding: 'utf8' }).trim();
	try {
		git('init', '-q'); git('config', 'user.email', 't@t'); git('config', 'user.name', 't');
		mkdirSync(join(repo, '.insrc', 'artifacts'), { recursive: true });
		mkdirSync(join(repo, 'docs', 'builds'), { recursive: true });
		writeFileSync(join(repo, 'f.ts'), 'export const f = 1;\n');
		git('add', '-A'); git('commit', '-qm', 'seed');
		await fn(repo, git('rev-parse', '--short', 'HEAD'));
	} finally { rmSync(repo, { recursive: true, force: true }); }
}

test('t7 WRITE SIDE: body.commit is populated from HEAD on BOTH routes, identically', async () => {
	await withGitRepo((repo, head) => {
		// plan-driven
		const { json: planJson } = persistBuildRecord(repo, planRec([{ id: 't1', passed: true }], '2026-01-01T00:00:00.000Z'));
		assert.equal(readJson(planJson).body['commit'], head, 'plan-driven route records HEAD');
	});
	await withGitRepo((repo, head) => {
		// standalone — same producer, because it lives in the single persist entry point
		const { json } = persistStandaloneBuildRecord(repo, {
			meta: { workflow: 'build', standalone: true, sizeClass: 'trivial', epicHash: HASH, storyId: 's1', createdAt: '2026-01-01T00:00:00.000Z' },
			body: { focus: 'F', producesLld: false },
		});
		assert.equal(readJson(json).body['commit'], head, 'standalone route records the SAME way');
	});
});

test('t7 WRITE SIDE: body.commit is OMITTED — not empty-stringed — when HEAD cannot be read', async () => {
	// A bare tmpdir: not a git repo, so `git rev-parse` fails.
	await withRepo((repo) => {
		const { json } = persistBuildRecord(repo, planRec([{ id: 't1', passed: true }], '2026-01-01T00:00:00.000Z'));
		const body = readJson(json).body;
		assert.ok(!('commit' in body),
			'ABSENT, not present-and-empty: a falsy commit would render an empty `**Commit:**` line, which is worse than no line');
	});
});

test('t7 WRITE SIDE: an explicitly SUPPLIED commit wins for that write; a later persist REFRESHES to HEAD (the specified "at persist time" semantics)', async () => {
	await withGitRepo((repo, head) => {
		const json = artifactJsonPath(repo, buildArtifactId(HASH, 's1'));
		// A caller that knows the commit can supply it, and it beats HEAD.
		persistBuildRecord(repo, {
			meta: { workflow: 'build', standalone: false, epicHash: HASH, storyId: 's1', createdAt: '2026-01-01T00:00:00.000Z' },
			body: { tasks: [{ id: 't1', passed: true }], commit: 'deadbee' },
		});
		assert.equal(readJson(json).body['commit'], 'deadbee', 'a supplied commit wins over HEAD for that write');

		// CORRECTED EXPECTATION. This test first asserted that a re-persist
		// PRESERVES the earlier commit — a behaviour the design never specifies. The
		// LLD says `body.commit` comes "from git HEAD at persist time", so a later
		// write that supplies none refreshes it. Pinned as the specified semantics
		// rather than quietly changing the code to match the wrong expectation.
		persistBuildRecord(repo, planRec([{ id: 't2', passed: true }], '2026-02-02T00:00:00.000Z'));
		assert.equal(readJson(json).body['commit'], head,
			'a later persist supplying no commit records HEAD at THAT persist time');
	});
});

test('t7 RENDER (PLAN-DRIVEN only): body.commit renders as `**Commit:**` and body.summary as `## Summary`', () => {
	const md = renderBuildRecordMd({
		meta: { workflow: 'build', standalone: false, epicHash: HASH, storyId: 's1', createdAt: '2026-01-01T00:00:00.000Z' },
		body: { tasks: [{ id: 't1', passed: true }], commit: 'abc1234', summary: 'Wired the collector to the committed range.' },
	});
	assert.match(md, /\*\*Commit:\*\* abc1234/);
	assert.match(md, /## Summary\n\nWired the collector to the committed range\./);
});

test('t7 RENDER: an absent commit/summary renders NEITHER section (omit-slots intact)', () => {
	const md = renderBuildRecordMd({
		meta: { workflow: 'build', standalone: false, epicHash: HASH, storyId: 's1', createdAt: '2026-01-01T00:00:00.000Z' },
		body: { tasks: [{ id: 't1', passed: true }] },
	});
	assert.doesNotMatch(md, /\*\*Commit:\*\*/);
	assert.doesNotMatch(md, /## Summary/);
});

test('t7: the three hand-filled records prove the gap was real — and are now what the producer writes automatically', async () => {
	// The dead-branch premise, pinned from the OTHER direction: these shipped
	// records carry body.commit with no producer in the codebase, so a human typed
	// them. A build now produces the same shape without hand-editing.
	for (const h of ['972bf31d13c81a2f', 'c90f3fe60b90dd44', 'be8708a9cd20e286']) {
		const rec = JSON.parse(readFileSync(join('.insrc', 'artifacts', `BUILD-${h}-S001.json`), 'utf8')) as { body: { commit?: string } };
		assert.equal(typeof rec.body.commit, 'string', `BUILD-${h} carries a hand-filled commit`);
	}
	await withGitRepo((repo, head) => {
		const { json } = persistBuildRecord(repo, planRec([{ id: 't1', passed: true }], '2026-01-01T00:00:00.000Z'));
		assert.equal(readJson(json).body['commit'], head, 'and a build now records it automatically');
	});
});

// ---------------------------------------------------------------------------
// t8 (ISSUE-93081bff91ae5108 / S001) — the CONVERGED renderer.
//
// Two parts always render (title, meta line) and SEVEN are omit-slots. The count
// is asserted here rather than inherited: the LLD's test strategy says "eight".
// ---------------------------------------------------------------------------

const FULL: BuildRecord = {
	meta: {
		workflow: 'build', standalone: true, sizeClass: 'small', triageRationale: 'why it was small',
		epicHash: HASH, storyId: 's1', createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-02-02T00:00:00.000Z',
	},
	body: {
		focus: 'The scope statement.', producesLld: false, commit: 'abc1234',
		summary: 'What the build did.', tasks: [{ id: 't1', passed: true }],
		changeLog: [{ target: { file: 'src/a.ts' }, author: 'insrc-build', timestamp: '2026-02-02T00:00:00.000Z' }],
		feedback: [{ id: 'f1', author: 'reviewer', timestamp: '2026-02-02T00:00:00.000Z', target: { file: 'src/a.ts' }, comment: 'nit' }],
	},
};

const MINIMAL: BuildRecord = {
	meta: { workflow: 'build', standalone: false, epicHash: HASH, storyId: 's1', createdAt: '2026-01-01T00:00:00.000Z' },
	body: {},
};

test('t8: the TWO unconditional parts always render, even on a record carrying nothing else', () => {
	const md = renderBuildRecordMd(MINIMAL);
	assert.match(md, /^# Build \(plan-driven\) — Story s1$/m, 'the title always renders');
	assert.match(md, /\*\*Standalone:\*\* no  ·  \*\*Created:\*\* 2026-01-01T00:00:00\.000Z/, 'and the meta line');
});

test('t8: each of the SEVEN omit-slots renders when populated — one assertion per section', () => {
	const md = renderBuildRecordMd(FULL);
	const checks: [string, RegExp][] = [
		['Commit',           /\*\*Commit:\*\* abc1234/],
		['Scope',            /## Scope\n\nThe scope statement\./],
		['Triage rationale', /## Triage rationale\n\nwhy it was small/],
		['Summary',          /## Summary\n\nWhat the build did\./],
		['Tasks validated',  /## Tasks validated\n\n- ✓ `t1`/],
		['Changes',          /## Changes\n\n- `src\/a\.ts`/],
		['Feedback',         /## Feedback/],
	];
	assert.equal(checks.length, 7, 'SEVEN omit-slots — counted, not the LLD\'s unverified "eight"');
	for (const [name, re] of checks) assert.match(md, re, `${name} must render when populated`);
});

test('t8: each of the SEVEN omit-slots is ABSENT when its content is — one assertion per section', () => {
	const md = renderBuildRecordMd(MINIMAL);
	for (const heading of ['**Commit:**', '## Scope', '## Triage rationale', '## Summary', '## Tasks validated', '## Changes', '## Feedback']) {
		assert.ok(!md.includes(heading), `${heading} must be absent on a record with no such content`);
	}
});

test('t8: the title derives from meta.sizeClass, NOT meta.standalone — the FLIPPED state still renders a standalone title', () => {
	// standalone:false (as the validate write left it) but sizeClass set: the exact
	// state the flip produced. sizeClass is immune to that write, so it decides.
	const flipped: BuildRecord = {
		meta: { workflow: 'build', standalone: false, sizeClass: 'trivial', epicHash: HASH, storyId: 's1', createdAt: '2026-01-01T00:00:00.000Z' },
		body: { focus: 'Still a standalone story.', producesLld: false },
	};
	const md = renderBuildRecordMd(flipped);
	assert.match(md, /^# Build \(standalone trivial\) — Story s1$/m,
		'the sizeClass decides the title even when the flag says otherwise');
	assert.match(md, /## Scope\n\nStill a standalone story\./,
		'and its focus renders — the content the flip used to orphan');
});

test('t8: a record carrying BOTH focus and tasks renders BOTH sections — neither route\'s content is lost', () => {
	const md = renderBuildRecordMd({
		meta: { workflow: 'build', standalone: true, sizeClass: 'small', epicHash: HASH, storyId: 's1', createdAt: '2026-01-01T00:00:00.000Z' },
		body: { focus: 'The scope.', tasks: [{ id: 't1', passed: true }] },
	});
	assert.match(md, /## Scope/);
	assert.match(md, /## Tasks validated/);
});

test('t8: STANDALONE-route rendering of body.summary and body.commit now works — the half deferred from t7', () => {
	const md = renderBuildRecordMd({
		meta: { workflow: 'build', standalone: true, sizeClass: 'trivial', epicHash: HASH, storyId: 's1', createdAt: '2026-01-01T00:00:00.000Z' },
		body: { focus: 'F', producesLld: false, commit: 'abc1234', summary: 'A standalone narrative.' },
	});
	assert.match(md, /\*\*Commit:\*\* abc1234/, 'commit renders on the standalone route (it did not before t8)');
	assert.match(md, /## Summary\n\nA standalone narrative\./, 'and so does summary');
});

test('t8: an empty or absent changeLog still renders NO `## Changes` section', () => {
	for (const changeLog of [undefined, []] as const) {
		const md = renderBuildRecordMd({ ...MINIMAL, body: { ...MINIMAL.body, ...(changeLog !== undefined ? { changeLog } : {}) } });
		assert.ok(!md.includes('## Changes'), `changeLog=${JSON.stringify(changeLog)} must render no section`);
	}
});

test('t8: renderStandaloneBuildRecordMd still exports and DELEGATES — identical output, not a second implementation', () => {
	const rec: StandaloneBuildRecord = {
		meta: { workflow: 'build', standalone: true, sizeClass: 'trivial', epicHash: HASH, storyId: 's1', createdAt: '2026-01-01T00:00:00.000Z' },
		body: { focus: 'Add a --json flag to the status subcommand.', producesLld: false },
	};
	assert.equal(renderStandaloneBuildRecordMd(rec), renderBuildRecordMd(rec as unknown as BuildRecord),
		'the shim returns exactly what the converged renderer returns');
	// And it still produces the frozen expectation, so the shim is not a new path.
	assert.equal(renderStandaloneBuildRecordMd(rec), THIN_WRAPPER_GOLDEN);
});

test('t8: NO code path selects a renderer on meta.standalone — the same record renders the same regardless of the flag, except for its honest "Standalone:" bit', () => {
	const base = {
		meta: { workflow: 'build' as const, sizeClass: 'small', epicHash: HASH, storyId: 's1', createdAt: '2026-01-01T00:00:00.000Z' },
		body: { focus: 'The scope.', tasks: [{ id: 't1', passed: true }] },
	};
	const asTrue  = renderBuildRecordMd({ ...base, meta: { ...base.meta, standalone: true } });
	const asFalse = renderBuildRecordMd({ ...base, meta: { ...base.meta, standalone: false } });
	// Both render the SAME sections — the flag no longer routes anything.
	for (const heading of ['## Scope', '## Tasks validated']) {
		assert.ok(asTrue.includes(heading) && asFalse.includes(heading), `${heading} renders either way`);
	}
	// The ONLY difference is the field that honestly reports the flag.
	assert.equal(asTrue.replace('**Standalone:** yes', '**Standalone:** no'), asFalse,
		'flipping the flag changes exactly one substring and nothing else');
});

// ---------------------------------------------------------------------------
// S001/t4 — the placement flag is INHERITED, never asserted false, and a prior
// true survives a later write that omits it.
// ---------------------------------------------------------------------------

const T4_HASH = 'e1f2a3b4c5d6e7f8';
const T4_CREATED = '2026-10-02T12:00:00.000Z';

function t4Repo(): { repo: string; cleanup: () => void } {
	const repo = mkdtempSync(join(tmpdir(), 'insrc-t4-placement-'));
	return { repo, cleanup: () => rmSync(repo, { recursive: true, force: true }) };
}

test('t4 — a record carrying standalone true is placed under docs/standalone', () => {
	const r = t4Repo();
	try {
		const { md } = persistBuildRecord(r.repo, {
			meta: { workflow: 'build', epicHash: T4_HASH, storyId: 'S001', createdAt: T4_CREATED, updatedAt: T4_CREATED, standalone: true },
			body: { tasks: [] },
		});
		assert.ok(md.includes('/docs/standalone/'), `expected a standalone placement, got ${md}`);
		assert.ok(!md.includes('/docs/epics/'));
	} finally { r.cleanup(); }
});

test('t4 — CARRY-FORWARD: a prior true survives a later write that OMITS the flag, and the markdown does not move', () => {
	const r = t4Repo();
	try {
		// First write: the flag is true, so the record is placed as standalone.
		const first = persistBuildRecord(r.repo, {
			meta: { workflow: 'build', epicHash: T4_HASH, storyId: 'S001', createdAt: T4_CREATED, updatedAt: T4_CREATED, standalone: true },
			body: { tasks: [] },
		});
		assert.ok(first.md.includes('/docs/standalone/'));

		// Second write OMITS the flag entirely — the shape every completion-hook
		// write takes when the definition artifact is unreadable. mergeWithPrior
		// must carry the prior true forward.
		const second = persistBuildRecord(r.repo, {
			meta: { workflow: 'build', epicHash: T4_HASH, storyId: 'S001', createdAt: T4_CREATED, updatedAt: T4_CREATED },
			body: { tasks: [], summary: 'second write' },
		});
		assert.equal(second.md, first.md,
			'the markdown must NOT move: relocating it is the exact regression the no-false rule prevents');
		assert.ok(second.md.includes('/docs/standalone/'));

		// And the persisted flag itself is still true.
		const persisted = JSON.parse(readFileSync(second.json, 'utf8')) as { meta: { standalone?: boolean } };
		assert.equal(persisted.meta.standalone, true);
	} finally { r.cleanup(); }
});

test('t4 — an omitted flag on a FIRST write still reads as epic, so nothing is manufactured', () => {
	const r = t4Repo();
	try {
		const { md } = persistBuildRecord(r.repo, {
			meta: { workflow: 'build', epicHash: T4_HASH, storyId: 'S001', createdAt: T4_CREATED, updatedAt: T4_CREATED },
			body: { tasks: [] },
		});
		assert.ok(md.includes('/docs/epics/'), 'absent means epic — only an explicit true is standalone');
	} finally { r.cleanup(); }
});
