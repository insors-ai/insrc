/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Unit tests for the CODE-review gate step in approveWorkflowTarget (the S007
 * follow-up: enforceCodeReviewGate wired into Story approval). Pure filesystem —
 * a tmp repo with a story-scoped artifact JSON + a `CR-<epic>-<story>.json`
 * record; the `enforce` flag is injected via the test-only opts seam so no
 * `~/.insrc/config.json` is read or written, and no daemon/graph is touched.
 *
 * The gate is a SEPARATE check over the code review's `body.verdict` — it never
 * merges into `meta.review` (the design-artifact review). It is strictly
 * additive + fail-open: absent / DEF-HLD (no storyId) / enforce-off / corrupt
 * record all leave approval byte-identical to before the wiring.
 *
 * Run: npx tsx --test src/workflow/__tests__/approve-codereview-gate.test.ts
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { approveWorkflowTarget } from '../gates.js';
import { codeReviewArtifactPaths } from '../storage.js';

const HASH = 'abc123def4567890';

function withRepo(fn: (repo: string, artifactsDir: string) => void): void {
	const repo = mkdtempSync(join(tmpdir(), 'insrc-cr-gate-'));
	const artifactsDir = join(repo, '.insrc', 'artifacts');
	mkdirSync(artifactsDir, { recursive: true });
	try { fn(repo, artifactsDir); } finally { rmSync(repo, { recursive: true, force: true }); }
}

/** A pending story-scoped artifact JSON (no approvedAt). `review` optionally
 *  seeds a meta.review (design-artifact review) to prove the two gates stay
 *  distinct. Omit `storyId` to model a DEF/HLD (the gate then never runs). */
function writeArtifact(
	dir: string,
	name: string,
	opts: { workflow: string; storyId?: string; review?: unknown },
): string {
	const meta: Record<string, unknown> = { workflow: opts.workflow, epicHash: HASH };
	if (opts.storyId !== undefined) meta['storyId'] = opts.storyId;
	if (opts.review !== undefined)  meta['review']  = opts.review;
	const p = join(dir, name);
	writeFileSync(p, JSON.stringify({ meta, body: {}, citations: [] }, null, 2));
	return p;
}

/** Write a CR-<epic>-<story>.json record with the given verdict, or a corrupt
 *  (unparseable) record. Skip entirely to model an absent record. */
function writeCR(repo: string, storyId: string, verdict: 'pass' | 'warn' | 'block' | 'corrupt'): void {
	const json = codeReviewArtifactPaths(repo, HASH, storyId).json;
	if (verdict === 'corrupt') { writeFileSync(json, '{ not valid json'); return; }
	writeFileSync(json, JSON.stringify({ body: { verdict, counts: { high: verdict === 'block' ? 2 : 0, med: 1, low: 3 } } }, null, 2));
}

const isApproved = (jsonPath: string): boolean =>
	(JSON.parse(readFileSync(jsonPath, 'utf8')) as { meta?: { approvedAt?: string } }).meta?.approvedAt !== undefined;

// ---------------------------------------------------------------------------
// ac1 — a code-review block withholds completion
// ---------------------------------------------------------------------------

test('ac1: enforce on + CR block + no override → skipped, no approvedAt, codeReview[] blocked', () => {
	withRepo((repo, dir) => {
		const p = writeArtifact(dir, `BUILD-${HASH}-s1.json`, { workflow: 'build', storyId: 's1' });
		writeCR(repo, 's1', 'block');
		const out = approveWorkflowTarget({ repoPath: repo, artifactPath: p }, { enforce: true });
		assert.equal(out.approved.length, 0);
		assert.equal(out.skipped.length, 1);
		assert.equal(out.skipped[0]!.path, p);
		assert.match(out.skipped[0]!.reason, /code review BLOCKS/);
		assert.ok(!isApproved(p), 'blocked artifact NOT stamped');
		assert.equal(out.codeReview.length, 1);
		assert.equal(out.codeReview[0]!.status, 'blocked');
		assert.equal(out.codeReview[0]!.storyId, 's1');
	});
});

// ---------------------------------------------------------------------------
// ac2 — override bypasses the block and records the audit on the outcome
// ---------------------------------------------------------------------------

test('ac2: enforce on + CR block + overrideReview → approved, codeReview[] overridden + overrideReason', () => {
	withRepo((repo, dir) => {
		const p = writeArtifact(dir, `BUILD-${HASH}-s1.json`, { workflow: 'build', storyId: 's1' });
		writeCR(repo, 's1', 'block');
		const out = approveWorkflowTarget({ repoPath: repo, artifactPath: p, overrideReview: 'verified sound' }, { enforce: true });
		assert.equal(out.approved.length, 1);
		assert.equal(out.skipped.length, 0);
		assert.ok(isApproved(p));
		assert.equal(out.codeReview[0]!.status, 'overridden');
		assert.equal(out.codeReview[0]!.overrideReason, 'verified sound', 'override recorded on the presented outcome');
		assert.equal(typeof out.codeReview[0]!.at, 'string');
	});
});

// ---------------------------------------------------------------------------
// ac3 — warn / pass are advisory: approval proceeds, status surfaced
// ---------------------------------------------------------------------------

test('ac3: CR warn → approved, codeReview[] warn + counts', () => {
	withRepo((repo, dir) => {
		const p = writeArtifact(dir, `BUILD-${HASH}-s1.json`, { workflow: 'build', storyId: 's1' });
		writeCR(repo, 's1', 'warn');
		const out = approveWorkflowTarget({ repoPath: repo, artifactPath: p }, { enforce: true });
		assert.equal(out.approved.length, 1);
		assert.ok(isApproved(p));
		assert.equal(out.codeReview[0]!.status, 'warn');
		assert.deepEqual(out.codeReview[0]!.counts, { high: 0, med: 1, low: 3 });
	});
});

test('ac3: CR pass → approved, codeReview[] pass + counts', () => {
	withRepo((repo, dir) => {
		const p = writeArtifact(dir, `BUILD-${HASH}-s1.json`, { workflow: 'build', storyId: 's1' });
		writeCR(repo, 's1', 'pass');
		const out = approveWorkflowTarget({ repoPath: repo, artifactPath: p }, { enforce: true });
		assert.equal(out.approved.length, 1);
		assert.equal(out.codeReview[0]!.status, 'pass');
		assert.deepEqual(out.codeReview[0]!.counts, { high: 0, med: 1, low: 3 });
	});
});

// ---------------------------------------------------------------------------
// ac5 — strictly additive: absent / DEF-HLD / enforce-off leave approval alone
// ---------------------------------------------------------------------------

test('ac5: absent CR record (non-BUILD) → approved byte-identical, codeReview[] no-review', () => {
	// A non-BUILD story artifact: the gate fails OPEN (absent => no-review) and
	// completion proceeds. The BUILD-under-enforce require-review withhold is a
	// separate, BUILD-scoped rule covered by approve-build-completion.test.ts.
	withRepo((repo, dir) => {
		const p = writeArtifact(dir, `LLD-${HASH}-s1.json`, { workflow: 'design.story', storyId: 's1' });
		// no writeCR — the record is absent
		const out = approveWorkflowTarget({ repoPath: repo, artifactPath: p }, { enforce: true });
		assert.equal(out.approved.length, 1);
		assert.ok(isApproved(p));
		assert.equal(out.codeReview[0]!.status, 'no-review');
	});
});

test('ac5: DEF/HLD artifact (no storyId) → gate never runs, codeReview empty, approved', () => {
	withRepo((repo, dir) => {
		const p = writeArtifact(dir, `HLD-${HASH}.json`, { workflow: 'design.epic' });   // no storyId
		writeCR(repo, 's1', 'block');   // a CR for s1 exists but must not be consulted
		const out = approveWorkflowTarget({ repoPath: repo, artifactPath: p }, { enforce: true });
		assert.equal(out.approved.length, 1);
		assert.ok(isApproved(p));
		assert.equal(out.codeReview.length, 0, 'gate does not run for a non-story-scoped artifact');
	});
});

test('ac5: enforce OFF + CR block → approved (demoted advisory), codeReview[] warn/advisory', () => {
	withRepo((repo, dir) => {
		const p = writeArtifact(dir, `BUILD-${HASH}-s1.json`, { workflow: 'build', storyId: 's1' });
		writeCR(repo, 's1', 'block');
		const out = approveWorkflowTarget({ repoPath: repo, artifactPath: p }, { enforce: false });
		assert.equal(out.approved.length, 1, 'enforce off never withholds completion');
		assert.ok(isApproved(p));
		assert.equal(out.codeReview[0]!.status, 'warn');
		assert.match(out.codeReview[0]!.message ?? '', /advisory only/);
	});
});

// ---------------------------------------------------------------------------
// batch — per-artifact, non-lossy
// ---------------------------------------------------------------------------

test('batch: story A CR block + story B CR pass (enforce on) → A skipped, B approved', () => {
	// Batch sweeps DEF/HLD/LLD/PLAN (pendingArtifactJsonPaths) — use LLD names.
	withRepo((repo, dir) => {
		const a = writeArtifact(dir, `LLD-${HASH}-s1.json`, { workflow: 'design.story', storyId: 's1' });
		const b = writeArtifact(dir, `LLD-${HASH}-s2.json`, { workflow: 'design.story', storyId: 's2' });
		writeCR(repo, 's1', 'block');
		writeCR(repo, 's2', 'pass');
		const out = approveWorkflowTarget({ repoPath: repo, epicHash: HASH }, { enforce: true });
		assert.deepEqual(out.approved.map(x => x.path), [b], 'only the passing story approved');
		assert.deepEqual(out.skipped.map(x => x.path), [a], 'the blocked story skipped, not dropped');
		assert.ok(!isApproved(a) && isApproved(b));
		const byStory = Object.fromEntries(out.codeReview.map(o => [o.storyId, o.status]));
		assert.deepEqual(byStory, { s1: 'blocked', s2: 'pass' });
	});
});

// ---------------------------------------------------------------------------
// ac6 — distinct from meta.review; corrupt record fails open
// ---------------------------------------------------------------------------

test('ac6: clean meta.review + CR block → withheld ONLY by the code-review gate', () => {
	withRepo((repo, dir) => {
		// A passing design-review (meta.review) — approveArtifactByJsonPath alone
		// would stamp it. The code-review block is the sole reason completion is held.
		const cleanReview = { verdict: 'pass', findings: [], counts: { high: 0, med: 0, low: 0 } };
		const p = writeArtifact(dir, `BUILD-${HASH}-s1.json`, { workflow: 'build', storyId: 's1', review: cleanReview });
		writeCR(repo, 's1', 'block');
		const out = approveWorkflowTarget({ repoPath: repo, artifactPath: p }, { enforce: true });
		assert.equal(out.skipped.length, 1);
		assert.match(out.skipped[0]!.reason, /code review BLOCKS/, 'held by the code-review gate, not meta.review');
		assert.ok(!isApproved(p));
		assert.equal(out.codeReview[0]!.status, 'blocked');
	});
});

test('ac6: corrupt CR record (non-BUILD) → no-review fail-open, approved', () => {
	// Fail-open: an unreadable CR record never manufactures a block. Asserted on a
	// non-BUILD artifact so it isolates the gate's fail-open from the BUILD-completion
	// withhold (a corrupt record on a BUILD under enforce is withheld — see ac3 there).
	withRepo((repo, dir) => {
		const p = writeArtifact(dir, `LLD-${HASH}-s1.json`, { workflow: 'design.story', storyId: 's1' });
		writeCR(repo, 's1', 'corrupt');
		const out = approveWorkflowTarget({ repoPath: repo, artifactPath: p }, { enforce: true });
		assert.equal(out.approved.length, 1, 'an unreadable CR record never manufactures a block');
		assert.ok(isApproved(p));
		assert.equal(out.codeReview[0]!.status, 'no-review');
	});
});
