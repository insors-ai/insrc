/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Unit + integration tests for the s5 finalize projection + guards + seal
 * (t4 / t5 / t6):
 *
 *   - projection: re-project runState/halt/filesTouched ONCE from the terminal
 *     BuildRunProgress (complete + halted), carry taskOutcomes[] verbatim,
 *     populate upstream ONLY from a BuildAdmissionAccepted verdict.
 *   - the three pre-seal precondition guards (missing-admission / non-terminal
 *     / halt-inconsistent).
 *   - grow-in-place checkpoint (buildCheckpointArtifact) is reloadable before
 *     finalize; restart-then-finalize seals the reloaded checkpoint in place.
 *   - seal-failure catch-at-boundary: a throwing writer is caught and the
 *     prior grow-in-place checkpoint survives readable.
 *
 * Run: npx tsx --test src/workflow/runners/build/__tests__/finalize.test.ts
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
	assembleBuildArtifact,
	buildCheckpointArtifact,
	projectBuildArtifact,
	readBuildCheckpoint,
	resolveTerminalOutcomes,
	sealBuildArtifact,
} from '../finalize.js';
import { projectBuildRunProgress } from '../progress.js';
import { BUILD_ARTIFACT_KIND, BUILD_SCHEMA_VERSION, renderBuildMarkdown, type BuildArtifact, type BuildMeta } from '../../../artifacts/build.js';
import { buildArtifactPaths, writeAtomic } from '../../../storage.js';
import type { PlanTask } from '../../../artifacts/plan.js';
import type {
	BuildAdmissionAccepted,
	BuildRunProgress,
	BuildTaskOutcome,
} from '../schemas.js';

const HASH = 'a3f4b8c9d1e2f3a4';

const PLAN_TASKS: PlanTask[] = [
	{ id: 't1', title: 'Task t1', summary: 'do t1', size: 'M', order: 1, dependsOn: [], acceptanceChecks: ['ok'], derivedFrom: ['c1'], tests: [{ level: 'unit', name: 'unit: t1' }] },
	{ id: 't2', title: 'Task t2', summary: 'do t2', size: 'M', order: 2, dependsOn: ['t1'], acceptanceChecks: ['ok'], derivedFrom: ['c1'], tests: [{ level: 'unit', name: 'unit: t2' }] },
];

const ACCEPTED: BuildAdmissionAccepted = { planArtifactId: `PLAN-${HASH}-s5`, planArtifactHash: 'planhash-abc', storyId: 's5' };

function reached(taskId: string, files: readonly string[], passed = true): BuildTaskOutcome {
	return {
		taskId, title: `Task ${taskId}`, dependsOn: [], status: passed ? 'completed' : 'failed',
		filesTouched: files, attempts: passed ? 1 : 3,
		testVerdict: { command: `unit: ${taskId}`, passed, exitCode: passed ? 0 : 1, summary: passed ? 'tests passed (exit 0)' : `tests FAILED (exit 1) for ${taskId}` },
	};
}

function completeOutcomes(): BuildTaskOutcome[] {
	return [reached('t1', ['src/a.ts', 'src/shared.ts']), reached('t2', ['src/shared.ts', 'src/b.ts'])];
}
function haltedOutcomes(): BuildTaskOutcome[] {
	return [reached('t1', ['src/a.ts']), reached('t2', ['src/b.ts'], false)];
}

function metaFor(storyId: string): BuildMeta {
	return {
		workflow: 'build', runId: 'build-run-1', repoPath: '/x', createdAt: '2026-01-01T00:00:00Z',
		model: 'client', elapsedMs: 1, repoIndexedAt: null, schemaVersion: BUILD_SCHEMA_VERSION,
		epicHash: HASH, epicSlug: 'build-s5', storyId, planRunId: 'plan-run-1',
	};
}

// ---------------------------------------------------------------------------
// t4 — projection (complete + halted), taskOutcomes verbatim, upstream from sc3
// ---------------------------------------------------------------------------

test('t4: projects a COMPLETE run once from the terminal frame; filesTouched dedup-union, taskOutcomes verbatim', () => {
	const outcomes = completeOutcomes();
	const progress = projectBuildRunProgress(outcomes, PLAN_TASKS, 's5');
	assert.equal(progress.runState, 'complete');
	const res = projectBuildArtifact({ progress, taskOutcomes: outcomes, admission: ACCEPTED, epicId: HASH });
	assert.ok(res.ok, JSON.stringify(res));
	if (!res.ok) return;
	assert.equal(res.core.runState, 'complete');
	assert.equal(res.core.halt, undefined);
	assert.deepEqual(res.core.filesTouched, ['src/a.ts', 'src/shared.ts', 'src/b.ts']);   // deduped union
	assert.equal(res.core.taskOutcomes, outcomes);                                        // verbatim (same ref)
	// upstream populated ONLY from the sc3 accepted verdict (+ epicId).
	assert.deepEqual(res.core.upstream, { planArtifactId: `PLAN-${HASH}-s5`, planArtifactHash: 'planhash-abc', storyId: 's5', epicId: HASH });
});

test('t4: projects a HALTED run — halt present, failed row files still counted in filesTouched', () => {
	const outcomes = haltedOutcomes();
	const progress = projectBuildRunProgress(outcomes, PLAN_TASKS, 's5');
	assert.equal(progress.runState, 'halted');
	const res = projectBuildArtifact({ progress, taskOutcomes: outcomes, admission: ACCEPTED, epicId: HASH });
	assert.ok(res.ok);
	if (!res.ok) return;
	assert.equal(res.core.runState, 'halted');
	assert.ok(res.core.halt !== undefined && res.core.halt.failedTaskId === 't2');
	assert.deepEqual(res.core.filesTouched, ['src/a.ts', 'src/b.ts']);   // includes the failed t2's diff
});

// ---------------------------------------------------------------------------
// t4 — the three pre-seal precondition guards
// ---------------------------------------------------------------------------

test('t4 guard: a missing BuildAdmissionAccepted verdict aborts (never fabricates the ac3 citation)', () => {
	const outcomes = completeOutcomes();
	const progress = projectBuildRunProgress(outcomes, PLAN_TASKS, 's5');
	const res = projectBuildArtifact({ progress, taskOutcomes: outcomes, admission: undefined, epicId: HASH });
	assert.equal(res.ok, false);
	if (res.ok) return;
	assert.equal(res.code, 'missing-admission');
});

test('t4 guard: a non-terminal (running) BuildRunProgress is refused — no record produced', () => {
	const running: BuildRunProgress = { storyId: 's5', runState: 'running', totalTasks: 2, completedTaskIds: ['t1'], filesTouchedSoFar: ['src/a.ts'], inFlightTaskId: 't2' };
	const res = projectBuildArtifact({ progress: running, taskOutcomes: [reached('t1', ['src/a.ts'])], admission: ACCEPTED, epicId: HASH });
	assert.equal(res.ok, false);
	if (res.ok) return;
	assert.equal(res.code, 'non-terminal-run');
});

test('t4 guard: a halt/runState inconsistency is rejected in BOTH directions', () => {
	// 'halted' with no BuildHaltInfo.
	const haltedNoInfo: BuildRunProgress = { storyId: 's5', runState: 'halted', totalTasks: 2, completedTaskIds: ['t1'], filesTouchedSoFar: [] };
	const r1 = projectBuildArtifact({ progress: haltedNoInfo, taskOutcomes: [], admission: ACCEPTED, epicId: HASH });
	assert.equal(r1.ok, false);
	if (!r1.ok) assert.equal(r1.code, 'halt-inconsistent');
	// halt present on a 'complete' run.
	const completeWithHalt: BuildRunProgress = { storyId: 's5', runState: 'complete', totalTasks: 2, completedTaskIds: ['t1', 't2'], filesTouchedSoFar: [], halt: { failedTaskId: 't2', failedTaskTitle: 'Task t2', reason: 'x', blockedTaskIds: [] } };
	const r2 = projectBuildArtifact({ progress: completeWithHalt, taskOutcomes: [], admission: ACCEPTED, epicId: HASH });
	assert.equal(r2.ok, false);
	if (!r2.ok) assert.equal(r2.code, 'halt-inconsistent');
});

// ---------------------------------------------------------------------------
// t5 — grow-in-place checkpoint reloadable before finalize
// ---------------------------------------------------------------------------

test('t5: a grow-in-place checkpoint (unsealed, possibly running) is independently reloadable before finalize', () => {
	const repo = mkdtempSync(join(tmpdir(), 'insrc-build-cp-'));
	try {
		const outcomes: BuildTaskOutcome[] = [reached('t1', ['src/a.ts']), { taskId: 't2', title: 'Task t2', dependsOn: ['t1'], status: 'running' }];
		const progress = projectBuildRunProgress(outcomes, PLAN_TASKS, 's5');
		assert.equal(progress.runState, 'running');
		const artifact = buildCheckpointArtifact({ meta: metaFor('s5'), upstream: { ...ACCEPTED, epicId: HASH }, progress, taskOutcomes: outcomes });
		writeAtomic(buildArtifactPaths(repo, HASH, 's5', 'build-s5').json, JSON.stringify(artifact, null, 2) + '\n');

		const reloaded = readBuildCheckpoint(repo, HASH, 's5');
		assert.ok(reloaded !== undefined);
		assert.equal(reloaded!.kind, BUILD_ARTIFACT_KIND);
		assert.equal(reloaded!.runState, 'running');
		assert.equal(reloaded!.taskOutcomes.length, 2);
	} finally { rmSync(repo, { recursive: true, force: true }); }
});

// ---------------------------------------------------------------------------
// t6 — restart-then-finalize seals the reloaded checkpoint in place
// ---------------------------------------------------------------------------

test('t6: restart-then-finalize reloads the checkpoint + seals it in place (hash-json + slug-md), identical flat shape', () => {
	const repo = mkdtempSync(join(tmpdir(), 'insrc-build-seal-'));
	try {
		// A terminal checkpoint persisted at the last Task boundary (pre-restart).
		const outcomes = completeOutcomes();
		const cpProgress = projectBuildRunProgress(outcomes, PLAN_TASKS, 's5');
		const cp = buildCheckpointArtifact({ meta: metaFor('s5'), upstream: { ...ACCEPTED, epicId: HASH }, progress: cpProgress, taskOutcomes: outcomes });
		const jsonPath = buildArtifactPaths(repo, HASH, 's5', 'build-s5').json;
		writeAtomic(jsonPath, JSON.stringify(cp, null, 2) + '\n');

		// Restart: reload the checkpoint, re-project ONCE, seal in place.
		const reloaded = readBuildCheckpoint(repo, HASH, 's5');
		assert.ok(reloaded !== undefined);
		const progress = projectBuildRunProgress(reloaded!.taskOutcomes, PLAN_TASKS, 's5');
		const proj = projectBuildArtifact({ progress, taskOutcomes: reloaded!.taskOutcomes, admission: ACCEPTED, epicId: HASH });
		assert.ok(proj.ok);
		if (!proj.ok) return;
		const sealed = assembleBuildArtifact({ meta: metaFor('s5'), core: proj.core, citations: [{ id: 'c1', kind: 'prior-artifact', ref: 'Plan s5' }] });
		const res = sealBuildArtifact({ repoPath: repo, artifact: sealed, render: renderBuildMarkdown });
		assert.ok(res.ok, JSON.stringify(res));
		if (!res.ok) return;
		assert.ok(existsSync(res.jsonPath) && existsSync(res.mdPath));
		const onDisk = JSON.parse(readFileSync(res.jsonPath, 'utf8')) as BuildArtifact;
		assert.equal(onDisk.runState, 'complete');
		assert.equal(onDisk.taskOutcomes.length, 2);

		// IDEMPOTENT: re-sealing rewrites identical bytes.
		const again = sealBuildArtifact({ repoPath: repo, artifact: sealed, render: renderBuildMarkdown });
		assert.ok(again.ok);
		if (again.ok) assert.equal(again.renderedJson, res.renderedJson);
	} finally { rmSync(repo, { recursive: true, force: true }); }
});

test('t6: seal-failure is caught at the boundary — the prior grow-in-place checkpoint survives readable', () => {
	const repo = mkdtempSync(join(tmpdir(), 'insrc-build-sealfail-'));
	try {
		// Prior checkpoint on disk.
		const outcomes = completeOutcomes();
		const cp = buildCheckpointArtifact({ meta: metaFor('s5'), upstream: { ...ACCEPTED, epicId: HASH }, progress: projectBuildRunProgress(outcomes, PLAN_TASKS, 's5'), taskOutcomes: outcomes });
		const jsonPath = buildArtifactPaths(repo, HASH, 's5', 'build-s5').json;
		const cpBytes = JSON.stringify(cp, null, 2) + '\n';
		writeAtomic(jsonPath, cpBytes);

		// Seal with a writer that throws — must NOT crash; returns ok:false.
		const proj = projectBuildArtifact({ progress: projectBuildRunProgress(outcomes, PLAN_TASKS, 's5'), taskOutcomes: outcomes, admission: ACCEPTED, epicId: HASH });
		assert.ok(proj.ok);
		if (!proj.ok) return;
		const sealed = assembleBuildArtifact({ meta: metaFor('s5'), core: proj.core, citations: [] });
		const res = sealBuildArtifact({
			repoPath: repo, artifact: sealed, render: renderBuildMarkdown,
			write: () => { throw new Error('disk full'); },
		});
		assert.equal(res.ok, false);
		if (res.ok) return;
		assert.match(res.error, /disk full/);
		// The prior checkpoint is unchanged + still readable.
		assert.equal(readFileSync(jsonPath, 'utf8'), cpBytes);
	} finally { rmSync(repo, { recursive: true, force: true }); }
});

// ---------------------------------------------------------------------------
// resolveTerminalOutcomes — step outputs preferred, checkpoint fallback
// ---------------------------------------------------------------------------

test('resolveTerminalOutcomes: prefers live tasks.sequence step output; falls back to the reloaded checkpoint', () => {
	const repo = mkdtempSync(join(tmpdir(), 'insrc-build-resolve-'));
	try {
		const outcomes = completeOutcomes();
		// Live step output present → used directly (no disk read needed).
		const fromSteps = resolveTerminalOutcomes({ s1: {}, s2: { admitted: true, taskOutcomes: outcomes } }, repo, HASH, 's5');
		assert.equal(fromSteps.length, 2);

		// No step output → reload the checkpoint (restart-safe seal).
		const cp = buildCheckpointArtifact({ meta: metaFor('s5'), upstream: { ...ACCEPTED, epicId: HASH }, progress: projectBuildRunProgress(outcomes, PLAN_TASKS, 's5'), taskOutcomes: outcomes });
		writeAtomic(buildArtifactPaths(repo, HASH, 's5', 'build-s5').json, JSON.stringify(cp, null, 2) + '\n');
		const fromCp = resolveTerminalOutcomes({}, repo, HASH, 's5');
		assert.equal(fromCp.length, 2);

		// Nothing anywhere → empty (an admitted no-Task run).
		const empty = resolveTerminalOutcomes({}, repo, HASH, 's-none');
		assert.deepEqual(empty, []);
	} finally { rmSync(repo, { recursive: true, force: true }); }
});
