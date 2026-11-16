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
import { existsSync, mkdtempSync, mkdirSync, rmSync, writeFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { approveWorkflowTarget } from '../gates.js';
import { artifactJsonPath, codeReviewArtifactId } from '../storage.js';
import { approvalStateOf } from '../artifact-core/approval-view.js';
import { stampOtherPartyReview } from './helpers/other-party-review.js';
import { approvedMeta, reviewedMeta } from './lifecycle-fixtures.js';
import { approveTarget } from './helpers/approve.js';
import { validCodeReview } from './helpers/valid-code-review.js';

const HASH = 'abc123def4567890';

async function withRepo(fn: (repo: string, artifactsDir: string) => void | Promise<void>): Promise<void> {
	const repo = mkdtempSync(join(tmpdir(), 'insrc-build-completion-'));
	const artifactsDir = join(repo, '.insrc', 'artifacts');
	mkdirSync(artifactsDir, { recursive: true });
	try { await fn(repo, artifactsDir); } finally { rmSync(repo, { recursive: true, force: true }); }
}

/** A pending story-scoped artifact JSON (a draft). `name` sets the kind
 *  via its prefix (BUILD-/LLD-/…). `review` optionally seeds a meta.review. */
function writeArtifact(
	dir: string,
	name: string,
	opts: { workflow: string; storyId?: string; review?: unknown },
): string {
	const meta: Record<string, unknown> = { workflow: opts.workflow, epicHash: HASH };
	if (opts.storyId !== undefined) meta['storyId'] = opts.storyId;
	if (opts.review !== undefined)  Object.assign(meta, reviewedMeta());   // a passing design review of its own
	const p = join(dir, name);
	// a BUILD names the files it changed, and the review must cover them
	const body = opts.workflow === 'build' ? { changeLog: [{ target: { file: 'src/a.ts' } }, { target: { file: 'src/b.ts' } }] } : {};
	writeFileSync(p, JSON.stringify({ meta, body, citations: [] }, null, 2));
	// A design artifact given no review of its own gets a passing other-party one:
	// approval requires it, and these tests are about the CODE-review gate.
	if (opts.review === undefined && /^(DEF|HLD|LLD)-/.test(name)) stampOtherPartyReview(p);
	return p;
}

/** Write a CR-<epic>-<story>.json record with the given verdict; skip to model absent. */
function writeCR(repo: string, storyId: string, verdict: 'pass' | 'warn' | 'block'): void {
	const json = artifactJsonPath(repo, codeReviewArtifactId(HASH, storyId));
	// bound to the BUILD of the Story as it is now (an absent one binds to nothing)
	const buildJson = join(repo, '.insrc', 'artifacts', `BUILD-${HASH}-${storyId}.json`);
	const build: unknown = existsSync(buildJson) ? JSON.parse(readFileSync(buildJson, 'utf8')) : {};
	writeFileSync(json, JSON.stringify(validCodeReview(build, verdict), null, 2));
}

const isApproved = (jsonPath: string): boolean =>
	approvalStateOf((JSON.parse(readFileSync(jsonPath, 'utf8')) as { meta?: unknown }).meta) === 'approved';

// ---------------------------------------------------------------------------
// ac1 — the widened epic-batch sweep now covers BUILD
// ---------------------------------------------------------------------------

test('ac1: epic-batch sweep includes a pending BUILD; excludes an already-approved BUILD', async () => {
	await withRepo(async (repo, dir) => {
		const pending  = writeArtifact(dir, `BUILD-${HASH}-s1.json`, { workflow: 'build', storyId: 's1' });
		writeCR(repo, 's1', 'pass');   // so the pending BUILD completes (not withheld) under enforce
		// an already-approved BUILD for s2
		const doneP = writeArtifact(dir, `BUILD-${HASH}-s2.json`, { workflow: 'build', storyId: 's2' });
		const j = JSON.parse(readFileSync(doneP, 'utf8')) as { meta: Record<string, unknown> };
		Object.assign(j.meta, approvedMeta({ at: new Date(0).toISOString() }));
		writeFileSync(doneP, JSON.stringify(j));

		const out = await approveTarget({ repoPath: repo, epicHash: HASH }, { enforce: true });
		assert.deepEqual(out.approved.map(a => a.path), [pending], 'the pending BUILD is swept + completed');
		assert.equal(out.skipped.length, 0);
		assert.ok(isApproved(pending) && isApproved(doneP));
	});
});

test('ac6: a story-scoped artifact whose basename is NOT BUILD- is not withheld even under enforce (basename predicate)', async () => {
	await withRepo(async (repo, dir) => {
		// A PLAN artifact whose meta.workflow happens to read 'build' must NOT be withheld —
		// the predicate keys on the BUILD- filename prefix, not meta.workflow.
		const p = writeArtifact(dir, `PLAN-${HASH}-s1.json`, { workflow: 'build', storyId: 's1' });
		const out = await approveTarget({ repoPath: repo, artifactPath: p }, { enforce: true });
		assert.equal(out.approved.length, 1, 'non-BUILD basename => no withhold, regardless of meta.workflow');
		assert.equal(out.skipped.length, 0);
		assert.ok(isApproved(p));
	});
});
