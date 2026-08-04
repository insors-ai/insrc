/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Unit tests for BUILD-as-story-completion (epic a131994ea1f99207 / S001): the
 * widened epic-batch sweep + the BUILD-under-enforce completion withhold in
 * approveWorkflowTarget. Pure filesystem — a tmp repo with a BUILD-<hash>-<story>
 * artifact JSON + an optional CR-<epic>-<story>.json record; codeReview.enforce is
 * injected via the opts.enforce seam so no ~/.insrc/config.json is read/written and
 * no daemon/graph is touched.
 *
 * Story-completion = BUILD.meta.approvedAt stamped, gated by the code review. The
 * withhold is strictly additive + fail-open by default: it fires ONLY for a BUILD
 * artifact (id prefix BUILD-) under effective enforcement with a 'no-review' gate
 * status and no override. Everything else is byte-identical to before.
 *
 * Run: npx tsx --test src/workflow/__tests__/approve-build-completion.test.ts
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
	const repo = mkdtempSync(join(tmpdir(), 'insrc-build-completion-'));
	const artifactsDir = join(repo, '.insrc', 'artifacts');
	mkdirSync(artifactsDir, { recursive: true });
	try { fn(repo, artifactsDir); } finally { rmSync(repo, { recursive: true, force: true }); }
}

/** A pending story-scoped artifact JSON (no approvedAt). `name` sets the kind
 *  via its prefix (BUILD-/LLD-/…). `review` optionally seeds a meta.review. */
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

/** Write a CR-<epic>-<story>.json record with the given verdict; skip to model absent. */
function writeCR(repo: string, storyId: string, verdict: 'pass' | 'warn' | 'block'): void {
	const json = codeReviewArtifactPaths(repo, HASH, storyId).json;
	writeFileSync(json, JSON.stringify({ body: { verdict, counts: { high: verdict === 'block' ? 2 : 0, med: 1, low: 3 } } }, null, 2));
}

const isApproved = (jsonPath: string): boolean =>
	(JSON.parse(readFileSync(jsonPath, 'utf8')) as { meta?: { approvedAt?: string } }).meta?.approvedAt !== undefined;

// ---------------------------------------------------------------------------
// ac1 — the widened epic-batch sweep now covers BUILD
// ---------------------------------------------------------------------------

test('ac1: epic-batch sweep includes a pending BUILD; excludes an already-approved BUILD', () => {
	withRepo((repo, dir) => {
		const pending  = writeArtifact(dir, `BUILD-${HASH}-s1.json`, { workflow: 'build', storyId: 's1' });
		writeCR(repo, 's1', 'pass');   // so the pending BUILD completes (not withheld) under enforce
		// an already-approved BUILD for s2
		const doneP = writeArtifact(dir, `BUILD-${HASH}-s2.json`, { workflow: 'build', storyId: 's2' });
		const j = JSON.parse(readFileSync(doneP, 'utf8')) as { meta: Record<string, unknown> };
		j.meta['approvedAt'] = new Date(0).toISOString();
		writeFileSync(doneP, JSON.stringify(j));

		const out = approveWorkflowTarget({ repoPath: repo, epicHash: HASH }, { enforce: true });
		assert.deepEqual(out.approved.map(a => a.path), [pending], 'the pending BUILD is swept + completed');
		assert.equal(out.skipped.length, 0);
		assert.ok(isApproved(pending) && isApproved(doneP));
	});
});

// ---------------------------------------------------------------------------
// ac2 — single BUILD + pass CR completes (existing single-path gate not regressed)
// ---------------------------------------------------------------------------

test('ac2: single BUILD + enforce ON + CR pass => completes, codeReview[] pass', () => {
	withRepo((repo, dir) => {
		const p = writeArtifact(dir, `BUILD-${HASH}-s1.json`, { workflow: 'build', storyId: 's1' });
		writeCR(repo, 's1', 'pass');
		const out = approveWorkflowTarget({ repoPath: repo, artifactPath: p }, { enforce: true });
		assert.equal(out.approved.length, 1);
		assert.ok(isApproved(p));
		assert.equal(out.codeReview[0]!.status, 'pass');
	});
});

// ---------------------------------------------------------------------------
// ac3 — the completion withhold: BUILD + enforce + no CR record
// ---------------------------------------------------------------------------

test('ac3: BUILD + enforce ON + absent CR => withheld into skipped[], no approvedAt, codeReview[] no-review', () => {
	withRepo((repo, dir) => {
		const p = writeArtifact(dir, `BUILD-${HASH}-s1.json`, { workflow: 'build', storyId: 's1' });
		// no writeCR — the code review never ran
		const out = approveWorkflowTarget({ repoPath: repo, artifactPath: p }, { enforce: true });
		assert.equal(out.approved.length, 0);
		assert.equal(out.skipped.length, 1);
		assert.equal(out.skipped[0]!.path, p);
		assert.match(out.skipped[0]!.reason, /completion requires a code review/);
		assert.ok(!isApproved(p), 'a story cannot be completed with no code review under enforcement');
		assert.equal(out.codeReview[0]!.status, 'no-review');
	});
});

// ---------------------------------------------------------------------------
// ac4 — override bypasses the no-review withhold
// ---------------------------------------------------------------------------

test('ac4: BUILD + enforce ON + absent CR + overrideReview => completes, override recorded', () => {
	withRepo((repo, dir) => {
		const p = writeArtifact(dir, `BUILD-${HASH}-s1.json`, { workflow: 'build', storyId: 's1' });
		const out = approveWorkflowTarget({ repoPath: repo, artifactPath: p, overrideReview: 'reviewed manually' }, { enforce: true });
		assert.equal(out.approved.length, 1, 'an explicit override is a deliberate completion assertion');
		assert.equal(out.skipped.length, 0);
		assert.ok(isApproved(p));
		// no-review has nothing to override on the gate itself; the outcome still records no-review,
		// and the completion proceeds because overrideReview was supplied.
		assert.equal(out.codeReview[0]!.status, 'no-review');
	});
});

// ---------------------------------------------------------------------------
// ac5 — a code-review block still withholds (unchanged)
// ---------------------------------------------------------------------------

test('ac5: BUILD + enforce ON + CR block => withheld into skipped[], codeReview[] blocked', () => {
	withRepo((repo, dir) => {
		const p = writeArtifact(dir, `BUILD-${HASH}-s1.json`, { workflow: 'build', storyId: 's1' });
		writeCR(repo, 's1', 'block');
		const out = approveWorkflowTarget({ repoPath: repo, artifactPath: p }, { enforce: true });
		assert.equal(out.approved.length, 0);
		assert.equal(out.skipped.length, 1);
		assert.match(out.skipped[0]!.reason, /code review BLOCKS/);
		assert.ok(!isApproved(p));
		assert.equal(out.codeReview[0]!.status, 'blocked');
	});
});

// ---------------------------------------------------------------------------
// ac6 — fail-open by default + BUILD-scoped
// ---------------------------------------------------------------------------

test('ac6: BUILD + enforce OFF + absent CR => completes byte-identical (approved, no-review, skipped empty)', () => {
	withRepo((repo, dir) => {
		const p = writeArtifact(dir, `BUILD-${HASH}-s1.json`, { workflow: 'build', storyId: 's1' });
		const out = approveWorkflowTarget({ repoPath: repo, artifactPath: p }, { enforce: false });
		assert.deepEqual(out.approved.map(a => a.path), [p]);
		assert.ok(isApproved(p));
		assert.equal(out.codeReview[0]!.status, 'no-review');
		assert.equal(out.skipped.length, 0, 'enforce off never withholds — byte-identical to before this story');
	});
});

test('ac6: non-BUILD LLD + enforce ON + absent CR => completes (the withhold is BUILD-scoped)', () => {
	withRepo((repo, dir) => {
		const p = writeArtifact(dir, `LLD-${HASH}-s1.json`, { workflow: 'design.story', storyId: 's1' });
		const out = approveWorkflowTarget({ repoPath: repo, artifactPath: p }, { enforce: true });
		assert.equal(out.approved.length, 1, 'a non-BUILD artifact is unaffected — gate no-review falls through');
		assert.ok(isApproved(p));
		assert.equal(out.codeReview[0]!.status, 'no-review');
	});
});

test('ac6: a story-scoped artifact whose basename is NOT BUILD- is not withheld even under enforce (basename predicate)', () => {
	withRepo((repo, dir) => {
		// A PLAN artifact whose meta.workflow happens to read 'build' must NOT be withheld —
		// the predicate keys on the BUILD- filename prefix, not meta.workflow.
		const p = writeArtifact(dir, `PLAN-${HASH}-s1.json`, { workflow: 'build', storyId: 's1' });
		const out = approveWorkflowTarget({ repoPath: repo, artifactPath: p }, { enforce: true });
		assert.equal(out.approved.length, 1, 'non-BUILD basename => no withhold, regardless of meta.workflow');
		assert.equal(out.skipped.length, 0);
		assert.ok(isApproved(p));
	});
});

// ---------------------------------------------------------------------------
// ac7 — distinct from meta.review + non-lossy batch
// ---------------------------------------------------------------------------

test('ac7: clean meta.review + BUILD withheld ONLY by the code-review gate (distinct from meta.review)', () => {
	withRepo((repo, dir) => {
		const cleanReview = { verdict: 'pass', findings: [], counts: { high: 0, med: 0, low: 0 } };
		const p = writeArtifact(dir, `BUILD-${HASH}-s1.json`, { workflow: 'build', storyId: 's1', review: cleanReview });
		// no CR record => the ONLY thing that can withhold completion is the code-review gate
		const out = approveWorkflowTarget({ repoPath: repo, artifactPath: p }, { enforce: true });
		assert.equal(out.skipped.length, 1);
		assert.match(out.skipped[0]!.reason, /completion requires a code review/, 'withheld by the code-review gate, not meta.review');
		assert.ok(!isApproved(p));
	});
});

test('ac7: epic batch withheld-BUILD + clean-LLD => BUILD skipped, LLD approved (non-lossy)', () => {
	withRepo((repo, dir) => {
		const build = writeArtifact(dir, `BUILD-${HASH}-s1.json`, { workflow: 'build', storyId: 's1' });   // no CR => withheld
		const lld   = writeArtifact(dir, `LLD-${HASH}-s2.json`,   { workflow: 'design.story', storyId: 's2' });
		const out = approveWorkflowTarget({ repoPath: repo, epicHash: HASH }, { enforce: true });
		assert.deepEqual(out.approved.map(a => a.path), [lld], 'the clean LLD is approved');
		assert.deepEqual(out.skipped.map(s => s.path), [build], 'the review-less BUILD is skipped, not dropped');
		assert.ok(!isApproved(build) && isApproved(lld));
	});
});
