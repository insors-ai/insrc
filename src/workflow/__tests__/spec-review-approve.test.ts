/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * S007 (Epic frame-epic-new-pre-workflow-brainstorm, sc4) — a brainstorm
 * SpecArtifact flows through the SAME workflow-agnostic review + approve seam as
 * every other artifact, and the `spec.resolveApproved` error-mapper maps
 * requireApprovedSpec's throws to structured { error, code }.
 *
 *   ac1 — the review runs over a SPEC md (stage = meta.workflow = 'brainstorm'),
 *         no per-type branch.
 *   ac2 — approve refuses a block-verdict SPEC without an override, approves with one.
 *   ac4 — the resolveApprovedSpec mapper: unapproved → { error, code:'not-approved' },
 *         missing → { error, code:'not-found' }, approved → { spec }.
 *
 * Run:
 *   npx tsx --test src/workflow/__tests__/spec-review-approve.test.ts
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
	approveArtifactByJsonPath,
	resolveApprovedSpec,
	ReviewBlockedError,
} from '../gates.js';
import { reviewArtifactFile } from '../review/run-artifact.js';
import {
	renderSpecMarkdown,
	SPEC_SCHEMA_VERSION,
	type SpecArtifact,
} from '../artifacts/spec.js';
import { specArtifactPaths, writeAtomic } from '../storage.js';
import type { ReviewReport } from '../review/types.js';
import type { LLMProvider } from '../../shared/types.js';

const SPEC_HASH = 'abcd1234ef567890';

function specArtifact(opts: { approved?: boolean; review?: ReviewReport } = {}): SpecArtifact {
	return {
		meta: {
			workflow:      'brainstorm',
			runId:         'wf-spec-ra-1',
			repoPath:      '/tmp/repo',
			createdAt:     '2026-08-02T00:00:00.000Z',
			elapsedMs:     10,
			repoIndexedAt: null,
			schemaVersion: SPEC_SCHEMA_VERSION,
			specHash:      SPEC_HASH,
			epicSlug:      'brainstorm-stage',
			...(opts.approved ? { approvedAt: '2026-08-02T01:00:00.000Z' } : {}),
			...(opts.review ? { review: opts.review } : {}),
		},
		body: {
			category:      'requirements',
			intent:        'Add a pre-workflow brainstorm stage that converges a rough idea into a spec.',
			scopeBoundary: 'Only the elicitation + persistence; downstream consumption is separate.',
			nonGoals:      ['autonomous daemon loop'],
			decisions:     [{ chosen: 'controller-driven', ruledOut: ['autonomous daemon loop'], reason: 'human stays in the loop.' }],
			openItems:     [],
		},
		citations: [{ id: 'c1', kind: 'step-output', ref: 's1' }],
	};
}

function blockReview(): ReviewReport {
	return {
		artifact:   'brainstorm',
		stage:      'brainstorm',
		verdict:    'block',
		findings:   [{
			claimId: 'cl1', kind: 'citation', severity: 'HIGH',
			premise: 'a load-bearing premise', evidence: 'contradicted by source',
			action: 'fix it', fixability: 'manual',
		}],
		counts:     { high: 1, med: 0, low: 0 },
		reviewedAt: '2026-08-02T00:30:00.000Z',
		model:      'client',
	};
}

function writeSpec(repo: string, artifact: SpecArtifact): { md: string; json: string } {
	const paths = specArtifactPaths(repo, artifact.meta.specHash!, artifact.meta.epicSlug);
	writeAtomic(paths.json, JSON.stringify(artifact, null, 2) + '\n');
	writeAtomic(paths.md, renderSpecMarkdown(artifact));
	return paths;
}

function withRepo(fn: (repo: string) => void | Promise<void>): void | Promise<void> {
	const repo = mkdtempSync(join(tmpdir(), 'insrc-spec-ra-'));
	const cleanup = () => rmSync(repo, { recursive: true, force: true });
	let out: void | Promise<void>;
	try { out = fn(repo); } catch (e) { cleanup(); throw e; }
	return out instanceof Promise ? out.finally(cleanup) : (cleanup(), out);
}

/** A minimal LLMProvider whose structured call yields ZERO claims, so the
 *  review pipeline runs end-to-end offline (no probes, no LLM verify) and the
 *  only thing under test is that a brainstorm artifact is reviewed generically. */
function zeroClaimsProvider(): LLMProvider {
	return {
		complete: async () => { throw new Error('not used'); },
		stream:   async function* () { /* not used */ },
		embed:    async () => [],
		supportsTools: false,
		completeStructured: async <T>() => ({ claims: [] } as unknown as T),
	} as unknown as LLMProvider;
}

// ---------------------------------------------------------------------------
// ac1 — the review runs over a SPEC md without a per-type branch
// ---------------------------------------------------------------------------

test('ac1: reviewArtifactFile reviews a SPEC md generically (stage = meta.workflow = brainstorm)', async () => {
	await withRepo(async repo => {
		const paths = writeSpec(repo, specArtifact());
		const result = await reviewArtifactFile({
			repo, jsonPath: paths.json, mdPath: paths.md,
			provider: zeroClaimsProvider(), model: 'test',
		});
		// The review ran (no per-type rejection) and derived its stage from
		// meta.workflow — proving a SPEC is a first-class review subject (ac1).
		assert.equal(result.report.stage, 'brainstorm');
		assert.equal(result.report.verdict, 'pass');
	});
});

// ---------------------------------------------------------------------------
// ac2 — approve refuses a block-verdict SPEC without an override
// ---------------------------------------------------------------------------

test('ac2: approve refuses a block-verdict SPEC without an override, approves with one', () => {
	withRepo(repo => {
		const paths = writeSpec(repo, specArtifact({ review: blockReview() }));
		// No override → refused, with the blocking reason surfaced.
		assert.throws(
			() => approveArtifactByJsonPath(paths.json),
			(e: unknown) => e instanceof ReviewBlockedError && /1 HIGH/.test((e as Error).message),
		);
		// With an explicit override → approved + the override recorded.
		const res = approveArtifactByJsonPath(paths.json, { overrideReview: 'accepted risk for the demo' });
		assert.ok(res.approvedAt);
	});
});

// ---------------------------------------------------------------------------
// ac4 — the resolveApprovedSpec error-mapper maps throws to { error, code }
// ---------------------------------------------------------------------------

test('ac4: resolveApprovedSpec maps unapproved → not-approved, missing → not-found, approved → { spec }', () => {
	withRepo(repo => {
		writeSpec(repo, specArtifact({ approved: false }));

		const unapproved = resolveApprovedSpec(repo, SPEC_HASH);
		assert.ok('error' in unapproved && unapproved.code === 'not-approved');
		assert.ok(!('spec' in unapproved));

		const missing = resolveApprovedSpec(repo, '0000000000000000');
		assert.ok('error' in missing && missing.code === 'not-found');

		// Approve, then it resolves to { spec }.
		const paths = specArtifactPaths(repo, SPEC_HASH, 'brainstorm-stage');
		approveArtifactByJsonPath(paths.json);
		const ok = resolveApprovedSpec(repo, SPEC_HASH);
		assert.ok('spec' in ok && ok.spec.meta.specHash === SPEC_HASH);
	});
});
