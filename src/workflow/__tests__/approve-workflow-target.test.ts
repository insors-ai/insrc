/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Unit tests for approveWorkflowTarget — the daemon-safe, non-lossy approval
 * used by the workflow.approve IPC / insrc_workflow_approve MCP tool.
 * Pure filesystem (no daemon, no cli/services).
 *
 * Run: npx tsx --test src/workflow/__tests__/approve-workflow-target.test.ts
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { approveWorkflowTarget, NoPendingArtifactsError, ArtifactMissingError } from '../gates.js';

const HASH = 'abc123def4567890';

function withRepo(fn: (repo: string, artifactsDir: string) => void): void {
	const repo = mkdtempSync(join(tmpdir(), 'insrc-approve-'));
	const artifactsDir = join(repo, '.insrc', 'artifacts');
	mkdirSync(artifactsDir, { recursive: true });
	try { fn(repo, artifactsDir); } finally { rmSync(repo, { recursive: true, force: true }); }
}

/** A pending artifact JSON (no approvedAt). `blocked` gives it an unresolved HIGH finding. */
function writeArtifact(dir: string, name: string, workflow: string, blocked = false): string {
	const meta: Record<string, unknown> = { workflow, epicHash: HASH };
	if (blocked) meta['review'] = { verdict: 'block', findings: [{ severity: 'HIGH', claimId: 'c1', summary: 'x' }], counts: { high: 1, med: 0, low: 0 } };
	const p = join(dir, name);
	writeFileSync(p, JSON.stringify({ meta, body: {}, citations: [] }, null, 2));
	return p;
}

const isApproved = (jsonPath: string): boolean =>
	(JSON.parse(readFileSync(jsonPath, 'utf8')) as { meta?: { approvedAt?: string } }).meta?.approvedAt !== undefined;

// ---------------------------------------------------------------------------
// single artifact
// ---------------------------------------------------------------------------

test('single: a review-clean artifact is approved (approvedAt stamped)', () => {
	withRepo((repo, dir) => {
		const p = writeArtifact(dir, `HLD-${HASH}.json`, 'design.epic');
		const out = approveWorkflowTarget({ repoPath: repo, artifactPath: p });
		assert.equal(out.approved.length, 1);
		assert.equal(out.skipped.length, 0);
		assert.equal(out.approved[0]!.path, p);
		assert.ok(isApproved(p), 'approvedAt written to disk');
	});
});

test('single: a review-blocked artifact lands in skipped[] (not approved[]), no override', () => {
	withRepo((repo, dir) => {
		const p = writeArtifact(dir, `LLD-${HASH}-s1.json`, 'design.story', /* blocked */ true);
		const out = approveWorkflowTarget({ repoPath: repo, artifactPath: p });
		assert.equal(out.approved.length, 0);
		assert.equal(out.skipped.length, 1);
		assert.equal(out.skipped[0]!.path, p);
		assert.ok(!isApproved(p), 'blocked artifact NOT stamped');
	});
});

test('single: overrideReview approves past the block', () => {
	withRepo((repo, dir) => {
		const p = writeArtifact(dir, `LLD-${HASH}-s1.json`, 'design.story', true);
		const out = approveWorkflowTarget({ repoPath: repo, artifactPath: p, overrideReview: 'verified sound' });
		assert.equal(out.approved.length, 1);
		assert.equal(out.skipped.length, 0);
		assert.ok(isApproved(p));
	});
});

test('single: a missing artifact throws ArtifactMissingError (not skipped)', () => {
	withRepo((repo, dir) => {
		assert.throws(
			() => approveWorkflowTarget({ repoPath: repo, artifactPath: join(dir, `HLD-${HASH}.json`) }),
			ArtifactMissingError,
		);
	});
});

// ---------------------------------------------------------------------------
// batch by epicHash
// ---------------------------------------------------------------------------

test('batch: a mixed epic splits into approved[] + skipped[] — nothing dropped', () => {
	withRepo((repo, dir) => {
		const clean1 = writeArtifact(dir, `DEF-${HASH}.json`, 'define');
		const clean2 = writeArtifact(dir, `LLD-${HASH}-s1.json`, 'design.story');
		const blocked = writeArtifact(dir, `LLD-${HASH}-s2.json`, 'design.story', true);
		const out = approveWorkflowTarget({ repoPath: repo, epicHash: HASH });
		const approvedPaths = out.approved.map(a => a.path).sort();
		assert.deepEqual(approvedPaths, [clean1, clean2].sort(), 'both clean artifacts approved');
		assert.equal(out.skipped.length, 1);
		assert.equal(out.skipped[0]!.path, blocked);
		assert.ok(isApproved(clean1) && isApproved(clean2) && !isApproved(blocked));
	});
});

test('batch: only NOT-yet-approved artifacts are swept (already-approved excluded)', () => {
	withRepo((repo, dir) => {
		writeArtifact(dir, `DEF-${HASH}.json`, 'define');   // pending
		const already = writeArtifact(dir, `HLD-${HASH}.json`, 'design.epic');
		// pre-approve HLD
		const j = JSON.parse(readFileSync(already, 'utf8')) as { meta: Record<string, unknown> };
		j.meta['approvedAt'] = new Date(0).toISOString();
		writeFileSync(already, JSON.stringify(j));
		const out = approveWorkflowTarget({ repoPath: repo, epicHash: HASH });
		assert.equal(out.approved.length, 1, 'only the pending DEF is swept');
		assert.ok(out.approved[0]!.path.endsWith(`DEF-${HASH}.json`));
	});
});

test('batch: an epic with ZERO pending artifacts throws NoPendingArtifactsError', () => {
	withRepo((repo, dir) => {
		// all artifacts already approved
		const p = writeArtifact(dir, `DEF-${HASH}.json`, 'define');
		const j = JSON.parse(readFileSync(p, 'utf8')) as { meta: Record<string, unknown> };
		j.meta['approvedAt'] = new Date(0).toISOString();
		writeFileSync(p, JSON.stringify(j));
		assert.throws(() => approveWorkflowTarget({ repoPath: repo, epicHash: HASH }), NoPendingArtifactsError);
	});
});

test('batch: an epic whose pending artifacts are ALL blocked returns approved=[] / skipped=[all] (NOT the empty error)', () => {
	withRepo((repo, dir) => {
		writeArtifact(dir, `LLD-${HASH}-s1.json`, 'design.story', true);
		writeArtifact(dir, `LLD-${HASH}-s2.json`, 'design.story', true);
		const out = approveWorkflowTarget({ repoPath: repo, epicHash: HASH });
		assert.equal(out.approved.length, 0);
		assert.equal(out.skipped.length, 2, 'both blocked artifacts reported, non-lossy');
	});
});
