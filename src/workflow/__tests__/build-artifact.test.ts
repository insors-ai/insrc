/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Unit tests for the `build` artifact SKELETON (Story s1): the body
 * guard (`isBuildBody`), the renderer + marker + shared citation footer,
 * storage paths, and md→json resolution + approval reuse.
 *
 * Proves ac3: the build artifact mirrors the sibling plan artifact's
 * durability envelope (slug-md + hash-json, marker-resolvable) and
 * writes through the SAME storage/gate machinery — no new persistence
 * substrate.
 *
 * Run: npx tsx --test src/workflow/__tests__/build-artifact.test.ts
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
	BUILD_SCHEMA_VERSION,
	isBuildBody,
	renderBuildMarkdown,
	type BuildArtifact,
} from '../artifacts/build.js';
import type { Citation } from '../types.js';
import { buildArtifactPaths, ARTIFACT_ID_MARKER_RE, writeAtomic } from '../storage.js';
import { approveArtifactByJsonPath, jsonPathForMd } from '../gates.js';

const HASH = 'a3f4b8c9d1e2f3a4';
const CITES: readonly Citation[] = [{ id: 'c1', kind: 'prior-artifact', ref: 'Plan s1 t1' }];

function fixtureArtifact(): BuildArtifact {
	return {
		meta: {
			workflow: 'build', runId: 'build-run-1', repoPath: '/x', createdAt: '2026-01-01T00:00:00Z',
			model: 'client', elapsedMs: 1, repoIndexedAt: null, schemaVersion: BUILD_SCHEMA_VERSION,
			epicHash: HASH, epicSlug: 'tag-filtering', storyId: 's1', planRunId: 'plan-run-1',
		},
		body: {
			summary: 'Implemented the tag filter Tasks.',
			taskOutcomes: [{
				taskId: 't1', title: 'Add filter path', dependsOn: [], status: 'completed',
				filesTouched: ['src/filter.ts'], attempts: 1,
				testVerdict: { command: 'npx tsx --test', passed: true, exitCode: 0, summary: 'tests passed (exit 0)' },
			}],
		},
		citations: [...CITES],
	};
}

// ---------------------------------------------------------------------------
// Guard
// ---------------------------------------------------------------------------

test('isBuildBody guards the summary + taskOutcomes shape', () => {
	assert.equal(isBuildBody({ summary: 'x', taskOutcomes: [] }), true);
	assert.equal(isBuildBody({ summary: 'x' }), false);            // missing taskOutcomes
	assert.equal(isBuildBody({ taskOutcomes: [] }), false);        // missing summary
	assert.equal(isBuildBody({ summary: 1, taskOutcomes: [] }), false);
	assert.equal(isBuildBody(null), false);
});

// ---------------------------------------------------------------------------
// Renderer + marker + shared citation footer
// ---------------------------------------------------------------------------

test('renderBuildMarkdown: leads with the BUILD- marker, renders summary + outcomes + [[cN]] footer', () => {
	const md = renderBuildMarkdown(fixtureArtifact());
	const m = ARTIFACT_ID_MARKER_RE.exec(md.slice(0, 200));
	assert.ok(m !== null, 'no artifact marker');
	assert.equal(m![1], `BUILD-${HASH}-s1`);
	assert.ok(md.includes('# Build: s1'));
	assert.ok(md.includes('Implemented the tag filter Tasks.'));
	assert.ok(md.includes('| `t1` | completed |'));   // reached outcome row
	assert.ok(md.includes('## Citations'));             // shared renderCitationBlock footer
	assert.ok(md.includes('[[c1]]'));
});

test('renderBuildMarkdown: round-trips an empty-outcomes skeleton (no outcomes table)', () => {
	const art: BuildArtifact = { ...fixtureArtifact(), body: { summary: 'nothing yet', taskOutcomes: [] } };
	const md = renderBuildMarkdown(art);
	assert.ok(md.includes('# Build: s1'));
	assert.ok(md.includes('nothing yet'));
	assert.ok(!md.includes('## Task outcomes'));
});

// ---------------------------------------------------------------------------
// Storage paths + md→json resolution + approval (mirrors plan-artifact)
// ---------------------------------------------------------------------------

test('buildArtifactPaths: slug-md under docs/builds + hash-json under .insrc/artifacts; hash fallback', () => {
	const p = buildArtifactPaths('/repo', HASH, 's1', 'tag-filtering');
	assert.ok(p.md.endsWith('/docs/builds/BUILD-tag-filtering-s1.md'), p.md);
	assert.ok(p.json.endsWith(`/.insrc/artifacts/BUILD-${HASH}-s1.json`), p.json);
	const noSlug = buildArtifactPaths('/repo', HASH, 's1');
	assert.ok(noSlug.md.endsWith(`/docs/builds/BUILD-${HASH}-s1.md`), noSlug.md);
});

test('jsonPathForMd resolves a rendered build md back to its canonical json; approve sets approvedAt', () => {
	const repo = mkdtempSync(join(tmpdir(), 'insrc-build-art-'));
	try {
		const paths = buildArtifactPaths(repo, HASH, 's1', 'tag-filtering');
		writeAtomic(paths.md, renderBuildMarkdown(fixtureArtifact()));
		writeAtomic(paths.json, JSON.stringify(fixtureArtifact(), null, 2) + '\n');
		assert.equal(jsonPathForMd(paths.md), paths.json);
		const res = approveArtifactByJsonPath(paths.json);
		assert.equal(res.workflow, 'build');
		assert.ok(res.approvedAt.length > 0);
	} finally {
		rmSync(repo, { recursive: true, force: true });
	}
});
