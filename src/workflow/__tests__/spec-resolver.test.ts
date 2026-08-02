/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * S007 (Epic frame-epic-new-pre-workflow-brainstorm, sc4) — the read-side spec
 * resolver: readSpecArtifact + requireApprovedSpec + their distinct errors, and
 * the never-auto-approve invariant (ac3/ac4).
 *
 * Run:
 *   npx tsx --test src/workflow/__tests__/spec-resolver.test.ts
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
	readSpecArtifact,
	requireApprovedSpec,
	SpecArtifactNotFoundError,
	SpecNotApprovedError,
	approveArtifactByJsonPath,
} from '../gates.js';
import {
	renderSpecMarkdown,
	SPEC_SCHEMA_VERSION,
	type SpecArtifact,
} from '../artifacts/spec.js';
import { specArtifactPaths, writeAtomic } from '../storage.js';

const SPEC_HASH = 'abcd1234ef567890';

function specArtifact(approved: boolean): SpecArtifact {
	return {
		meta: {
			workflow:      'brainstorm',
			runId:         'wf-spec-res-1',
			repoPath:      '/tmp/repo',
			createdAt:     '2026-08-02T00:00:00.000Z',
			elapsedMs:     10,
			repoIndexedAt: null,
			schemaVersion: SPEC_SCHEMA_VERSION,
			specHash:      SPEC_HASH,
			epicSlug:      'brainstorm-stage',
			...(approved ? { approvedAt: '2026-08-02T01:00:00.000Z' } : {}),
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

/** Persist a SPEC artifact (json + md) at its hash-addressed path into `repo`. */
function writeSpec(repo: string, artifact: SpecArtifact): { md: string; json: string } {
	const paths = specArtifactPaths(repo, artifact.meta.specHash!, artifact.meta.epicSlug);
	writeAtomic(paths.json, JSON.stringify(artifact, null, 2) + '\n');
	writeAtomic(paths.md, renderSpecMarkdown(artifact));
	return paths;
}

function withRepo(fn: (repo: string) => void): void {
	const repo = mkdtempSync(join(tmpdir(), 'insrc-spec-res-'));
	try { fn(repo); } finally { rmSync(repo, { recursive: true, force: true }); }
}

// ---------------------------------------------------------------------------
// readSpecArtifact + requireApprovedSpec
// ---------------------------------------------------------------------------

test('requireApprovedSpec: returns the record when meta.approvedAt is set', () => {
	withRepo(repo => {
		writeSpec(repo, specArtifact(true));
		const spec = requireApprovedSpec(repo, SPEC_HASH);
		assert.equal(spec.meta.specHash, SPEC_HASH);
		assert.ok(spec.meta.approvedAt);
		assert.equal(spec.body.intent.length > 0, true);
	});
});

test('requireApprovedSpec: throws SpecNotApprovedError (naming the SPEC id + outstanding) when unapproved (ac4)', () => {
	withRepo(repo => {
		writeSpec(repo, specArtifact(false));
		assert.throws(
			() => requireApprovedSpec(repo, SPEC_HASH),
			(e: unknown) => e instanceof SpecNotApprovedError
				&& /SPEC-abcd1234ef567890/.test((e as Error).message)
				&& /outstanding|approve/i.test((e as Error).message),
		);
	});
});

test('readSpecArtifact: throws SpecArtifactNotFoundError on a missing hash', () => {
	withRepo(repo => {
		assert.throws(
			() => readSpecArtifact(repo, '0000000000000000'),
			(e: unknown) => e instanceof SpecArtifactNotFoundError,
		);
	});
});

test('readSpecArtifact: throws a plain Error (not the typed ones) on a corrupt body', () => {
	withRepo(repo => {
		const bad = specArtifact(true) as unknown as { meta: SpecArtifact['meta']; body: unknown; citations: unknown };
		bad.body = { intent: 'no scopeBoundary, wrong shape' };  // fails isSpecBody
		const paths = specArtifactPaths(repo, SPEC_HASH, 'brainstorm-stage');
		writeAtomic(paths.json, JSON.stringify(bad, null, 2) + '\n');
		assert.throws(
			() => readSpecArtifact(repo, SPEC_HASH),
			(e: unknown) => e instanceof Error
				&& !(e instanceof SpecNotApprovedError)
				&& !(e instanceof SpecArtifactNotFoundError)
				&& /malformed/i.test((e as Error).message),
		);
	});
});

// ---------------------------------------------------------------------------
// ac3 — approval is never auto-granted; only an explicit approve stamps it
// ---------------------------------------------------------------------------

test('ac3: a freshly persisted spec is unapproved and cannot be consumed until an explicit approve stamps it', () => {
	withRepo(repo => {
		const paths = writeSpec(repo, specArtifact(false));
		// Freshly persisted: not consumable — nothing auto-approved it.
		assert.throws(() => requireApprovedSpec(repo, SPEC_HASH), SpecNotApprovedError);
		// Only an explicit approve stamps approvedAt (review is clean → no override needed).
		const res = approveArtifactByJsonPath(paths.json);
		assert.ok(res.approvedAt);
		// Now it resolves.
		const spec = requireApprovedSpec(repo, SPEC_HASH);
		assert.equal(spec.meta.approvedAt, res.approvedAt);
	});
});
