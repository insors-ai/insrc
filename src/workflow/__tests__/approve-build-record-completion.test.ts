/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Integration tests for the completion-side BUILD ledger hook wired into
 * approveWorkflowTarget (now async). A controller-side build skips the validate
 * phase, so its BUILD-<epicHash>-<storyId>.json may not exist at approval time;
 * the approve path CREATE-or-MERGES it BEFORE the existsSync/stamp so completion
 * never fails with ArtifactMissingError. Pure filesystem — a NON-git tmp repo
 * (collectBuildChangeLog then yields an empty change-log, which is fine: the
 * create + approve is what these assert).
 *
 * Run: npx tsx --test src/workflow/__tests__/approve-build-record-completion.test.ts
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, rmSync, existsSync, readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { approveWorkflowTarget, jsonPathForMd } from '../gates.js';
import { artifactJsonPath, buildArtifactId } from '../storage.js';
import { stampOtherPartyReview } from './helpers/other-party-review.js';

const HASH = 'abc123def4567890';

async function withRepo(fn: (repo: string, dir: string) => void | Promise<void>): Promise<void> {
	const repo = mkdtempSync(join(tmpdir(), 'insrc-approve-build-completion-'));
	const dir = join(repo, '.insrc', 'artifacts');
	mkdirSync(dir, { recursive: true });
	mkdirSync(join(repo, 'docs', 'builds'), { recursive: true });
	try { await fn(repo, dir); } finally { rmSync(repo, { recursive: true, force: true }); }
}

const isApproved = (p: string): boolean =>
	(JSON.parse(readFileSync(p, 'utf8')) as { meta?: { approvedAt?: string } }).meta?.approvedAt !== undefined;

// ---------------------------------------------------------------------------
// a BUILD target whose json does NOT exist yet is created, then approved
// ---------------------------------------------------------------------------

test('single BUILD target with no prior json => the hook CREATES the record, then it completes (no ArtifactMissingError)', async () => {
	await withRepo(async (repo) => {
		const json = artifactJsonPath(repo, buildArtifactId(HASH, 's7'));
		assert.ok(!existsSync(json), 'precondition: the BUILD json does not exist yet');
		const out = await approveWorkflowTarget({ repoPath: repo, artifactPath: json }, { enforce: false });
		assert.ok(existsSync(json), 'the completion hook created the BUILD json');
		assert.equal(out.approved.length, 1, 'the created BUILD is approved (not skipped)');
		assert.equal(out.skipped.length, 0);
		assert.ok(isApproved(jsonPathForMd(json)), 'meta.approvedAt is stamped on the created record');
	});
});

// ---------------------------------------------------------------------------
// a non-BUILD artifact approval never writes a BUILD record
// ---------------------------------------------------------------------------

test('non-BUILD (LLD) target => no BUILD json is written (the hook is BUILD-scoped)', async () => {
	await withRepo(async (repo, dir) => {
		const lld = join(dir, `LLD-${HASH}-s7.json`);
		writeFileSync(lld, JSON.stringify({ meta: { workflow: 'design.story', epicHash: HASH, storyId: 's7' }, body: {}, citations: [] }, null, 2));
		stampOtherPartyReview(lld);   // approval requires an other-party review
		const out = await approveWorkflowTarget({ repoPath: repo, artifactPath: lld }, { enforce: false });
		assert.equal(out.approved.length, 1, 'the LLD is approved');
		const builds = readdirSync(dir).filter((f) => f.startsWith('BUILD-'));
		assert.deepEqual(builds, [], 'no BUILD json was written for a non-BUILD approval');
	});
});
