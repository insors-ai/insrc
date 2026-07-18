/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Unit tests for the Story s2 `build` admission gate (sc3):
 *   - `admitBuild` — the four modeled verdicts + precedence + propagation
 *     of unmodeled errors + the thin accepted pointer (t4, ac1–ac4).
 *   - `approvalVerdict` — the build-private non-throwing approval wrapper
 *     (t2): ArtifactNotApprovedError → unapproved, ArtifactMissingError →
 *     missing, an unrelated error re-throws.
 *   - `driftVerdict` — the build-private plan-vs-design.story comparator
 *     (t3): differing ⇒ stale, equal ⇒ fresh, empty-recorded ⇒ stale.
 *   - `BuildAdmissionResult` — the discriminated union shape (t1).
 *   - guard — the wrapper + comparator are NOT on build/'s public surface.
 *
 * Run: npx tsx --test src/workflow/runners/build/__tests__/admit-build.test.ts
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { tmpdir } from 'node:os';

import { admitBuild } from '../index.js';
import * as buildIndex from '../index.js';
import { approvalVerdict, driftVerdict } from '../admission.js';
import { approveArtifactByJsonPath } from '../../../gates.js';
import type { PlanArtifact } from '../../../artifacts/plan.js';
import { lldArtifactPaths, planArtifactId, planArtifactPaths } from '../../../storage.js';

const HASH = 'a3f4b8c9d1e2f3a4';

// ---------------------------------------------------------------------------
// Fixtures — plan + LLD artifacts written through the real storage writers.
// ---------------------------------------------------------------------------

interface SeedPlanOpts {
	readonly storyId:           string;
	readonly lldEffectiveHash:  string;
	readonly approved:          boolean;
}

function planObject(storyId: string, lldEffectiveHash: string): PlanArtifact {
	return {
		meta: {
			workflow: 'plan', runId: 'plan-run-1', schemaVersion: 1,
			epicHash: HASH, epicSlug: 'tag-filtering', storyId,
			lldRunId: 'lld-run-1', lldEffectiveHash,
		},
		body: {
			tasks: [{
				id: 't1', title: 'Do the thing', summary: 'A task.',
				size: 'M', order: 1, dependsOn: [], acceptanceChecks: ['works'], derivedFrom: ['c1'],
				tests: [{ level: 'unit', name: 'unit: it works' }],
			}],
			testStrategyCoverage: [{ lldStrategyItem: 'unit: it works', coveredByTaskIds: ['t1'] }],
		},
		citations: [{ id: 'c1', kind: 'prior-artifact', ref: 'LLD' }],
	} as unknown as PlanArtifact;
}

function seedPlan(repo: string, opts: SeedPlanOpts): void {
	const pp = planArtifactPaths(repo, HASH, opts.storyId);
	mkdirSync(dirname(pp.json), { recursive: true });
	writeFileSync(pp.json, JSON.stringify(planObject(opts.storyId, opts.lldEffectiveHash), null, 2));
	if (opts.approved) approveArtifactByJsonPath(pp.json);
}

/** Seed a corrupt (undecodable) plan body at the plan's json path. */
function seedCorruptPlan(repo: string, storyId: string): void {
	const pp = planArtifactPaths(repo, HASH, storyId);
	mkdirSync(dirname(pp.json), { recursive: true });
	writeFileSync(pp.json, '{ this is not valid json');
}

/** Seed the current design.story (LLD) artifact; only meta is read. */
function seedLld(repo: string, storyId: string, hldEffectiveHash: string): void {
	const lp = lldArtifactPaths(repo, HASH, storyId);
	mkdirSync(dirname(lp.json), { recursive: true });
	writeFileSync(lp.json, JSON.stringify({
		meta: {
			workflow: 'design.story', runId: 'lld-run-1', schemaVersion: 1,
			epicHash: HASH, epicSlug: 'tag-filtering', storyId,
			hldBaseRunId: 'hld-run-1', hldEffectiveHash, hldAmendmentsApplied: [],
			approvedAt: '2026-07-18T00:00:00.000Z',
		},
		body: {}, citations: [],
	}, null, 2));
}

function mkRepo(): string {
	return mkdtempSync(join(tmpdir(), 'insrc-admit-build-'));
}

/** A byte-identical snapshot of every file under `dir` (path → content
 *  hash). Proves `treeUntouched` by OBSERVATION, not just the literal flag. */
function snapshotTree(dir: string): Map<string, string> {
	const out = new Map<string, string>();
	const walk = (d: string): void => {
		for (const name of readdirSync(d).sort()) {
			const p = join(d, name);
			if (statSync(p).isDirectory()) { walk(p); continue; }
			out.set(relative(dir, p), createHash('sha256').update(readFileSync(p)).digest('hex'));
		}
	};
	walk(dir);
	return out;
}

function assertTreeUnchanged(before: Map<string, string>, after: Map<string, string>): void {
	assert.deepEqual([...after.entries()].sort(), [...before.entries()].sort());
}

// ---------------------------------------------------------------------------
// t4 / ac1 — admitted: approved + fresh (incl. the equality boundary)
// ---------------------------------------------------------------------------

test('ac1: admitBuild returns admitted:true with only the thin pointer when approved + recorded==current', () => {
	const repo = mkRepo();
	try {
		seedPlan(repo, { storyId: 's1', lldEffectiveHash: 'basis-hash-xyz', approved: true });
		seedLld(repo, 's1', 'basis-hash-xyz');   // equality boundary ⇒ fresh
		const before = snapshotTree(repo);
		const result = admitBuild(repo, HASH, 's1');
		assert.equal(result.admitted, true);
		assert.ok(result.admitted === true);
		// Thin pointer: exactly {planArtifactId, planArtifactHash, storyId}, no PlanArtifact body.
		assert.deepEqual(Object.keys(result.plan).sort(), ['planArtifactHash', 'planArtifactId', 'storyId']);
		assert.equal(result.plan.planArtifactId, planArtifactId(HASH, 's1'));
		assert.equal(result.plan.storyId, 's1');
		assert.equal(typeof result.plan.planArtifactHash, 'string');
		assert.ok(result.plan.planArtifactHash.length > 0);
		assert.ok(!('plan' in (result.plan as Record<string, unknown>)), 'no nested PlanArtifact body');
		assertTreeUnchanged(before, snapshotTree(repo));
	} finally { rmSync(repo, { recursive: true, force: true }); }
});

// ---------------------------------------------------------------------------
// t4 / ac2 — plan-unapproved (evaluated BEFORE staleness)
// ---------------------------------------------------------------------------

test('ac2: admitBuild returns plan-unapproved when the plan exists but was never approved', () => {
	const repo = mkRepo();
	try {
		seedPlan(repo, { storyId: 's1', lldEffectiveHash: 'basis', approved: false });
		seedLld(repo, 's1', 'basis');
		const before = snapshotTree(repo);
		const result = admitBuild(repo, HASH, 's1');
		assert.equal(result.admitted, false);
		assert.ok(result.admitted === false);
		assert.equal(result.refusal.reason, 'plan-unapproved');
		assert.equal(result.refusal.treeUntouched, true);
		assert.equal(result.refusal.staleness, undefined);
		assertTreeUnchanged(before, snapshotTree(repo));
	} finally { rmSync(repo, { recursive: true, force: true }); }
});

test('ac2: approval is evaluated before staleness — unapproved AND drifted yields the single reason plan-unapproved', () => {
	const repo = mkRepo();
	try {
		// Unapproved AND the recorded basis differs from the current design hash.
		seedPlan(repo, { storyId: 's1', lldEffectiveHash: 'old-basis', approved: false });
		seedLld(repo, 's1', 'new-basis');
		const result = admitBuild(repo, HASH, 's1');
		assert.ok(result.admitted === false);
		assert.equal(result.refusal.reason, 'plan-unapproved');   // not plan-stale
		assert.equal(result.refusal.staleness, undefined);        // drift not computed
	} finally { rmSync(repo, { recursive: true, force: true }); }
});

// ---------------------------------------------------------------------------
// t4 / ac4 — plan-missing (precedence over staleness)
// ---------------------------------------------------------------------------

test('ac4: admitBuild returns plan-missing (precedence over staleness) when no plan record exists', () => {
	const repo = mkRepo();
	try {
		// A current design.story exists, but NO plan record for (epicHash, s1).
		seedLld(repo, 's1', 'some-hash');
		const before = snapshotTree(repo);
		const result = admitBuild(repo, HASH, 's1');
		assert.ok(result.admitted === false);
		assert.equal(result.refusal.reason, 'plan-missing');   // never plan-stale, never an empty admitted run
		assert.equal(result.refusal.treeUntouched, true);
		assertTreeUnchanged(before, snapshotTree(repo));
	} finally { rmSync(repo, { recursive: true, force: true }); }
});

// ---------------------------------------------------------------------------
// t4 / ac3 — plan-stale (drifted + empty-recorded), with inline staleness
// ---------------------------------------------------------------------------

test('ac3: admitBuild returns plan-stale with inline staleness when the recorded basis differs from current', () => {
	const repo = mkRepo();
	try {
		seedPlan(repo, { storyId: 's1', lldEffectiveHash: 'old-basis', approved: true });
		seedLld(repo, 's1', 'new-basis');
		const before = snapshotTree(repo);
		const result = admitBuild(repo, HASH, 's1');
		assert.ok(result.admitted === false);
		assert.equal(result.refusal.reason, 'plan-stale');
		assert.equal(result.refusal.treeUntouched, true);
		assert.deepEqual(result.refusal.staleness, {
			planRecordedDesignHash: 'old-basis',
			currentDesignHash:      'new-basis',
		});
		assertTreeUnchanged(before, snapshotTree(repo));
	} finally { rmSync(repo, { recursive: true, force: true }); }
});

test('ac3: admitBuild conservatively refuses plan-stale when the recorded design hash is empty/absent', () => {
	const repo = mkRepo();
	try {
		seedPlan(repo, { storyId: 's1', lldEffectiveHash: '', approved: true });   // empty recorded basis
		seedLld(repo, 's1', 'current-hash');
		const result = admitBuild(repo, HASH, 's1');
		assert.ok(result.admitted === false);
		assert.equal(result.refusal.reason, 'plan-stale');
		assert.deepEqual(result.refusal.staleness, {
			planRecordedDesignHash: '',
			currentDesignHash:      'current-hash',
		});
	} finally { rmSync(repo, { recursive: true, force: true }); }
});

// ---------------------------------------------------------------------------
// t4 — unmodeled errors PROPAGATE (never remapped to a modeled reason)
// ---------------------------------------------------------------------------

test('t4: admitBuild propagates a malformed epicHash rather than remapping it', () => {
	const repo = mkRepo();
	try {
		assert.throws(() => admitBuild(repo, 'not-a-valid-hash', 's1'), /epicHash/);
	} finally { rmSync(repo, { recursive: true, force: true }); }
});

test('t4: admitBuild propagates a corrupt plan body rather than reporting plan-missing', () => {
	const repo = mkRepo();
	try {
		seedCorruptPlan(repo, 's1');   // present on disk but undecodable
		assert.throws(() => admitBuild(repo, HASH, 's1'), (err: unknown) => {
			assert.ok(err instanceof SyntaxError);   // a parse error, not a modeled refusal
			return true;
		});
	} finally { rmSync(repo, { recursive: true, force: true }); }
});

test('t4: admitBuild propagates a missing current design.story rather than admitting or fabricating plan-stale', () => {
	const repo = mkRepo();
	try {
		seedPlan(repo, { storyId: 's1', lldEffectiveHash: 'basis', approved: true });
		// NO LLD seeded — the drift comparison has no current operand.
		assert.throws(() => admitBuild(repo, HASH, 's1'), /LLD not found/);
	} finally { rmSync(repo, { recursive: true, force: true }); }
});

// ---------------------------------------------------------------------------
// t2 — the build-private non-throwing approval wrapper
// ---------------------------------------------------------------------------

test('t2: approvalVerdict maps an unapproved plan to { unapproved }', () => {
	const repo = mkRepo();
	try {
		seedPlan(repo, { storyId: 's1', lldEffectiveHash: 'x', approved: false });
		const v = approvalVerdict(repo, HASH, 's1');
		assert.deepEqual(v, { unapproved: true });
	} finally { rmSync(repo, { recursive: true, force: true }); }
});

test('t2: approvalVerdict maps a missing plan to { missing }', () => {
	const repo = mkRepo();
	try {
		const v = approvalVerdict(repo, HASH, 's1');
		assert.deepEqual(v, { missing: true });
	} finally { rmSync(repo, { recursive: true, force: true }); }
});

test('t2: approvalVerdict re-throws an unrelated (corrupt-body) error rather than swallowing it', () => {
	const repo = mkRepo();
	try {
		seedCorruptPlan(repo, 's1');
		assert.throws(() => approvalVerdict(repo, HASH, 's1'), (err: unknown) => {
			assert.ok(err instanceof SyntaxError);
			return true;
		});
	} finally { rmSync(repo, { recursive: true, force: true }); }
});

test('t2: approvalVerdict returns { ok, plan } for an approved plan', () => {
	const repo = mkRepo();
	try {
		seedPlan(repo, { storyId: 's1', lldEffectiveHash: 'x', approved: true });
		const v = approvalVerdict(repo, HASH, 's1');
		assert.ok('ok' in v && v.ok === true);
		assert.equal(v.plan.meta.storyId, 's1');
	} finally { rmSync(repo, { recursive: true, force: true }); }
});

// ---------------------------------------------------------------------------
// t3 — the build-private plan-vs-design.story drift comparator
// ---------------------------------------------------------------------------

test('t3: driftVerdict yields stale with inline hashes when recorded differs from current', () => {
	const repo = mkRepo();
	try {
		seedLld(repo, 's1', 'current');
		const plan = planObject('s1', 'recorded');
		const v = driftVerdict(repo, HASH, 's1', plan);
		assert.deepEqual(v, { stale: true, planRecordedDesignHash: 'recorded', currentDesignHash: 'current' });
	} finally { rmSync(repo, { recursive: true, force: true }); }
});

test('t3: driftVerdict treats equal recorded/current hashes as fresh', () => {
	const repo = mkRepo();
	try {
		seedLld(repo, 's1', 'same');
		const v = driftVerdict(repo, HASH, 's1', planObject('s1', 'same'));
		assert.deepEqual(v, { fresh: true });
	} finally { rmSync(repo, { recursive: true, force: true }); }
});

test('t3: driftVerdict conservatively yields stale when the recorded design hash is empty', () => {
	const repo = mkRepo();
	try {
		seedLld(repo, 's1', 'current');
		const v = driftVerdict(repo, HASH, 's1', planObject('s1', ''));
		assert.deepEqual(v, { stale: true, planRecordedDesignHash: '', currentDesignHash: 'current' });
	} finally { rmSync(repo, { recursive: true, force: true }); }
});

// ---------------------------------------------------------------------------
// t2 / t3 — boundary guard: neither half is on build/'s public surface
// ---------------------------------------------------------------------------

test('guard: the approval wrapper + drift comparator are NOT re-exported from build/index', () => {
	assert.equal('approvalVerdict' in buildIndex, false);
	assert.equal('driftVerdict' in buildIndex, false);
	// The composed verdict + registration ARE the public surface.
	assert.equal(typeof buildIndex.admitBuild, 'function');
	assert.equal(typeof buildIndex.registerBuildRunners, 'function');
});

// ---------------------------------------------------------------------------
// t1 — BuildAdmissionResult discriminated-union shape
// ---------------------------------------------------------------------------

test('t1: BuildAdmissionResult discriminates on `admitted` (accepted branch carries only the thin pointer)', () => {
	const accepted = admitBuildAcceptedFixture();
	assert.equal(accepted.admitted, true);
	if (accepted.admitted) {
		assert.deepEqual(Object.keys(accepted.plan).sort(), ['planArtifactHash', 'planArtifactId', 'storyId']);
	}
});

function admitBuildAcceptedFixture(): ReturnType<typeof admitBuild> {
	const repo = mkRepo();
	try {
		seedPlan(repo, { storyId: 's1', lldEffectiveHash: 'h', approved: true });
		seedLld(repo, 's1', 'h');
		return admitBuild(repo, HASH, 's1');
	} finally { rmSync(repo, { recursive: true, force: true }); }
}
