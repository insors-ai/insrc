/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Unit tests for the s5 flat `build` artifact (sc7): the shape guard
 * (`isBuildArtifact` + the halt-present-iff-halted invariant), the
 * `filesTouched` dedup-union projection, the renderer + marker + upstream
 * citation block + shared citation footer, and the storage paths +
 * md→json resolution + approval reuse (ac1/ac2/ac3/ac4).
 *
 * Run: npx tsx --test src/workflow/__tests__/build-artifact.test.ts
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
	BUILD_ARTIFACT_KIND,
	BUILD_SCHEMA_VERSION,
	isBuildArtifact,
	projectFilesTouched,
	renderBuildMarkdown,
	type BuildArtifact,
} from '../artifacts/build.js';
import type { BuildTaskOutcome } from '../runners/build/schemas.js';
import type { Citation } from '../types.js';
import { buildArtifactPaths, ARTIFACT_ID_MARKER_RE, writeAtomic } from '../storage.js';
import { approveArtifactByJsonPath, jsonPathForMd, requireApprovedBuild, readBuildArtifact } from '../gates.js';

const HASH = 'a3f4b8c9d1e2f3a4';
const CITES: readonly Citation[] = [{ id: 'c1', kind: 'prior-artifact', ref: 'Plan s1 (PLAN-a3f4b8c9d1e2f3a4-s1)' }];

function reached(taskId: string, files: readonly string[]): BuildTaskOutcome {
	return {
		taskId, title: `Task ${taskId}`, dependsOn: [], status: 'completed',
		filesTouched: files, attempts: 1,
		testVerdict: { command: 'npx tsx --test', passed: true, exitCode: 0, summary: 'tests passed (exit 0)' },
	};
}

function meta(): BuildArtifact['meta'] {
	return {
		workflow: 'build', runId: 'build-run-1', repoPath: '/x', createdAt: '2026-01-01T00:00:00Z',
		model: 'client', elapsedMs: 1, repoIndexedAt: null, schemaVersion: BUILD_SCHEMA_VERSION,
		epicHash: HASH, epicSlug: 'tag-filtering', storyId: 's1', planRunId: 'plan-run-1',
	};
}

function upstream(): BuildArtifact['upstream'] {
	return { planArtifactId: `PLAN-${HASH}-s1`, planArtifactHash: 'abc123def456', storyId: 's1', epicId: HASH };
}

function completeArtifact(): BuildArtifact {
	return {
		kind: BUILD_ARTIFACT_KIND, meta: meta(), upstream: upstream(),
		runState: 'complete',
		taskOutcomes: [reached('t1', ['src/filter.ts']), reached('t2', ['src/index.ts'])],
		filesTouched: ['src/filter.ts', 'src/index.ts'],
		summary: 'Build complete: 2/2 Task(s) implemented.',
		citations: [...CITES],
	};
}

function haltedArtifact(): BuildArtifact {
	const failed: BuildTaskOutcome = {
		taskId: 't2', title: 'Task t2', dependsOn: ['t1'], status: 'failed',
		filesTouched: ['src/index.ts'], attempts: 3,
		testVerdict: { command: 'npx tsx --test', passed: false, exitCode: 1, summary: 'tests FAILED (exit 1) for t2' },
	};
	const blocked: BuildTaskOutcome = { taskId: 't3', title: 'Task t3', dependsOn: ['t2'], status: 'blocked' };
	return {
		kind: BUILD_ARTIFACT_KIND, meta: meta(), upstream: upstream(),
		runState: 'halted',
		taskOutcomes: [reached('t1', ['src/filter.ts']), failed, blocked],
		halt: { failedTaskId: 't2', failedTaskTitle: 'Task t2', reason: 'tests FAILED (exit 1) for t2', blockedTaskIds: ['t3'] },
		filesTouched: ['src/filter.ts', 'src/index.ts'],
		summary: 'Build halted on Task t2 (Task t2) — 1/3 Task(s) completed before the halt.',
		citations: [...CITES],
	};
}

function emptyArtifact(): BuildArtifact {
	return {
		kind: BUILD_ARTIFACT_KIND, meta: meta(), upstream: upstream(),
		runState: 'complete', taskOutcomes: [], filesTouched: [],
		summary: 'Build complete: no Tasks to implement (empty plan) — no-op run.',
		citations: [...CITES],
	};
}

// ---------------------------------------------------------------------------
// Guard — the halt-present-iff-halted invariant
// ---------------------------------------------------------------------------

test('isBuildArtifact accepts consistent complete / halted / empty records', () => {
	assert.equal(isBuildArtifact(completeArtifact()), true);
	assert.equal(isBuildArtifact(haltedArtifact()), true);
	assert.equal(isBuildArtifact(emptyArtifact()), true);
});

test('isBuildArtifact rejects halt-on-complete and halted-without-halt', () => {
	// halt present but runState !== 'halted'.
	const bad1 = { ...completeArtifact(), halt: haltedArtifact().halt };
	assert.equal(isBuildArtifact(bad1), false);
	// runState 'halted' with no BuildHaltInfo.
	const bad2 = { ...haltedArtifact() } as Record<string, unknown>;
	delete bad2['halt'];
	assert.equal(isBuildArtifact(bad2), false);
	// wrong kind / missing fields.
	assert.equal(isBuildArtifact({ ...completeArtifact(), kind: 'plan' }), false);
	assert.equal(isBuildArtifact(null), false);
	assert.equal(isBuildArtifact({ kind: BUILD_ARTIFACT_KIND }), false);
});

// ---------------------------------------------------------------------------
// filesTouched dedup-union projection
// ---------------------------------------------------------------------------

test('projectFilesTouched is the deduplicated union across taskOutcomes (overlapping paths once)', () => {
	const outcomes: BuildTaskOutcome[] = [
		reached('t1', ['src/a.ts', 'src/shared.ts']),
		reached('t2', ['src/shared.ts', 'src/b.ts']),      // src/shared.ts overlaps t1
		{ taskId: 't3', title: 'Task t3', dependsOn: [], status: 'blocked' },   // unreached → no files
	];
	assert.deepEqual(projectFilesTouched(outcomes), ['src/a.ts', 'src/shared.ts', 'src/b.ts']);
	assert.deepEqual(projectFilesTouched([]), []);
});

// ---------------------------------------------------------------------------
// Renderer + marker + upstream citation + shared footer
// ---------------------------------------------------------------------------

test('renderBuildMarkdown (complete): marker, header, per-Task rows, upstream citation, filesTouched, footer', () => {
	const md = renderBuildMarkdown(completeArtifact());
	const m = ARTIFACT_ID_MARKER_RE.exec(md.slice(0, 200));
	assert.ok(m !== null, 'no artifact marker');
	assert.equal(m![1], `BUILD-${HASH}-s1`);
	assert.ok(md.includes('# Build: s1'));
	assert.ok(md.includes('**Run state:** `complete`'));
	// upstream citation block (ac3) pins the exact approved plan revision.
	assert.ok(md.includes('## Upstream'));
	assert.ok(md.includes(`**Plan artifact:** \`PLAN-${HASH}-s1\``));
	assert.ok(md.includes('**Plan hash:** `abc123def456`'));
	// one entry per Task with status + testVerdict summary + files (ac2).
	assert.ok(md.includes('| `t1` | completed |'));
	assert.ok(md.includes('| `t2` | completed |'));
	assert.ok(md.includes('## Files touched'));
	assert.ok(md.includes('- `src/filter.ts`'));
	// shared citation footer.
	assert.ok(md.includes('## Citations'));
	assert.ok(md.includes('[[c1]]'));
});

test('renderBuildMarkdown (halted): renders the halt block naming the failed + blocked Tasks', () => {
	const md = renderBuildMarkdown(haltedArtifact());
	assert.ok(md.includes('**Run state:** `halted`'));
	assert.ok(md.includes('## Halt'));
	assert.ok(md.includes('halted on Task `t2`'));
	assert.ok(md.includes('tests FAILED (exit 1) for t2'));
	assert.ok(md.includes('**Blocked:** `t3`'));
	assert.ok(md.includes('| `t2` | failed |'));
	assert.ok(md.includes('| `t3` | blocked |'));
});

test('renderBuildMarkdown (empty run): valid readable no-op record, no halt block', () => {
	const md = renderBuildMarkdown(emptyArtifact());
	assert.ok(md.includes('# Build: s1'));
	assert.ok(md.includes('no-op run'));
	assert.ok(md.includes('_No Tasks were implemented in this run._'));
	assert.ok(md.includes('_No files landed on the tree._'));
	assert.ok(!md.includes('## Halt'));
});

// ---------------------------------------------------------------------------
// Storage paths + md→json resolution + approval (ac1/ac4 — gates path)
// ---------------------------------------------------------------------------

test('buildArtifactPaths: slug-md under docs/builds + hash-json under .insrc/artifacts; hash fallback', () => {
	const p = buildArtifactPaths('/repo', HASH, 's1', 'tag-filtering');
	assert.ok(p.md.endsWith('/docs/builds/BUILD-tag-filtering-s1.md'), p.md);
	assert.ok(p.json.endsWith(`/.insrc/artifacts/BUILD-${HASH}-s1.json`), p.json);
	const noSlug = buildArtifactPaths('/repo', HASH, 's1');
	assert.ok(noSlug.md.endsWith(`/docs/builds/BUILD-${HASH}-s1.md`), noSlug.md);
});

test('ac4: a finalized build is approvable + readable through the SAME gates path as sibling kinds', () => {
	const repo = mkdtempSync(join(tmpdir(), 'insrc-build-art-'));
	try {
		const paths = buildArtifactPaths(repo, HASH, 's1', 'tag-filtering');
		writeAtomic(paths.md, renderBuildMarkdown(completeArtifact()));
		writeAtomic(paths.json, JSON.stringify(completeArtifact(), null, 2) + '\n');
		// md→json resolves via the shared insrc:artifact marker.
		assert.equal(jsonPathForMd(paths.md), paths.json);

		// unapproved → treated as absent downstream (throws, exactly as siblings).
		assert.throws(() => requireApprovedBuild(repo, HASH, 's1'), /not approved/);
		// readBuildArtifact reads it back + asserts the kind discriminant.
		assert.equal(readBuildArtifact(repo, HASH, 's1').kind, BUILD_ARTIFACT_KIND);

		// approve through the identical approval path.
		const res = approveArtifactByJsonPath(paths.json);
		assert.equal(res.workflow, 'build');
		assert.ok(res.approvedAt.length > 0);
		// now requireApprovedBuild returns the approved record.
		assert.equal(requireApprovedBuild(repo, HASH, 's1').meta.approvedAt, res.approvedAt);
	} finally {
		rmSync(repo, { recursive: true, force: true });
	}
});
