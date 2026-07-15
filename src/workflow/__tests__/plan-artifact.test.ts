/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Unit tests for the `plan` artifact: the deterministic Task-graph +
 * test-strategy coverage validators, the renderer + marker, storage
 * paths, md→json resolution, and approval reuse.
 *
 * Run: npx tsx --test src/workflow/__tests__/plan-artifact.test.ts
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
	checkPlanTaskGraph,
	checkTestStrategyCoverage,
	isPlanBody,
	renderPlanMarkdown,
	type PlanArtifact,
	type PlanTask,
	type TestStrategyCoverage,
} from '../artifacts/plan.js';
import type { TestStrategy } from '../artifacts/lld.js';
import type { Citation } from '../types.js';
import { planArtifactPaths, ARTIFACT_ID_MARKER_RE, writeAtomic } from '../storage.js';
import { approveArtifactByJsonPath, jsonPathForMd } from '../gates.js';
import { validateCitations } from '../synthesizer.js';

const HASH = 'a3f4b8c9d1e2f3a4';
const CITES: readonly Citation[] = [{ id: 'c1', kind: 'prior-artifact', ref: 'LLD s1 handoff' }];

function task(over: Partial<PlanTask>): PlanTask {
	return {
		id: 't1', title: 'Do the thing', summary: 'A unit of work.', size: 'S', order: 1,
		dependsOn: [], acceptanceChecks: ['it is done'], derivedFrom: ['c1'],
		tests: [{ level: 'unit', name: 'unit: t1 works' }],
		...over,
	};
}

const LLD_STRATEGY: TestStrategy = {
	testLevels: [{ level: 'unit', purpose: 'x', subjects: ['unit: t1 works'] }],
	acceptanceMapping: [{ criterionId: 'ac1', provingTests: ['unit: t1 works'] }],
	testFramework: 'node:test',
};

// ---------------------------------------------------------------------------
// checkPlanTaskGraph
// ---------------------------------------------------------------------------

test('checkPlanTaskGraph: accepts a valid single-task graph', () => {
	assert.deepEqual(checkPlanTaskGraph([task({})], CITES), []);
});

test('checkPlanTaskGraph: accepts a valid multi-task ordered graph', () => {
	const tasks = [
		task({ id: 't1', order: 1, dependsOn: [] }),
		task({ id: 't2', order: 2, dependsOn: ['t1'] }),
		task({ id: 't3', order: 3, dependsOn: ['t1', 't2'] }),
	];
	assert.deepEqual(checkPlanTaskGraph(tasks, CITES), []);
});

test('checkPlanTaskGraph: rejects a dependency cycle', () => {
	const tasks = [
		task({ id: 't1', order: 1, dependsOn: ['t2'] }),
		task({ id: 't2', order: 2, dependsOn: ['t1'] }),
	];
	const issues = checkPlanTaskGraph(tasks, CITES);
	assert.ok(issues.some(i => /cycle/i.test(i)), issues.join('; '));
});

test('checkPlanTaskGraph: rejects a dangling dependsOn id', () => {
	const issues = checkPlanTaskGraph([task({ dependsOn: ['t9'] })], CITES);
	assert.ok(issues.some(i => /unknown Task id 't9'/.test(i)), issues.join('; '));
});

test('checkPlanTaskGraph: rejects order that is not a valid topological order', () => {
	const tasks = [
		task({ id: 't1', order: 2, dependsOn: ['t2'] }),   // depends on a later-ordered task
		task({ id: 't2', order: 1, dependsOn: [] }),
	];
	// t1 (order 2) depends on t2 (order 1) — that's actually valid (dep before).
	// Flip it to make it invalid: t1 order 1 depends on t2 order 2.
	const bad = [
		task({ id: 't1', order: 1, dependsOn: ['t2'] }),
		task({ id: 't2', order: 2, dependsOn: [] }),
	];
	assert.deepEqual(checkPlanTaskGraph(tasks, CITES), []);   // the first set is valid
	assert.ok(checkPlanTaskGraph(bad, CITES).some(i => /topological order/.test(i)));
});

test('checkPlanTaskGraph: rejects a non-t\\d id and empty derivedFrom', () => {
	const issues = checkPlanTaskGraph([task({ id: 'task-1', derivedFrom: [] })], CITES);
	assert.ok(issues.some(i => /does not match/.test(i)), issues.join('; '));
	assert.ok(issues.some(i => /empty derivedFrom/.test(i)), issues.join('; '));
});

test('checkPlanTaskGraph: rejects design under-coverage (a citation no Task derives from)', () => {
	const cites: Citation[] = [{ id: 'c1', kind: 'prior-artifact', ref: 'x' }, { id: 'c2', kind: 'prior-artifact', ref: 'y' }];
	const issues = checkPlanTaskGraph([task({ derivedFrom: ['c1'] })], cites);
	assert.ok(issues.some(i => /under-coverage.*c2/.test(i)), issues.join('; '));
});

test('checkPlanTaskGraph: rejects a derivedFrom id with no matching citation', () => {
	const issues = checkPlanTaskGraph([task({ derivedFrom: ['c9'] })], CITES);
	assert.ok(issues.some(i => /derivedFrom 'c9' does not resolve/.test(i)), issues.join('; '));
});

// ---------------------------------------------------------------------------
// checkTestStrategyCoverage
// ---------------------------------------------------------------------------

test('checkTestStrategyCoverage: returns [] for a total coverage map', () => {
	const coverage: TestStrategyCoverage[] = [{ lldStrategyItem: 'unit: t1 works', coveredByTaskIds: ['t1'] }];
	assert.deepEqual(checkTestStrategyCoverage([task({})], coverage, LLD_STRATEGY), []);
});

test('checkTestStrategyCoverage: flags an uncovered LLD strategy item', () => {
	const strat: TestStrategy = { ...LLD_STRATEGY, testLevels: [{ level: 'unit', purpose: 'x', subjects: ['unit: t1 works', 'unit: uncovered'] }] };
	const coverage: TestStrategyCoverage[] = [{ lldStrategyItem: 'unit: t1 works', coveredByTaskIds: ['t1'] }];
	const issues = checkTestStrategyCoverage([task({})], coverage, strat);
	assert.ok(issues.some(i => /uncovered.*unit: uncovered/.test(i)), issues.join('; '));
});

test('checkTestStrategyCoverage: flags a coverage row with an unknown task id', () => {
	const coverage: TestStrategyCoverage[] = [{ lldStrategyItem: 'unit: t1 works', coveredByTaskIds: ['t9'] }];
	const issues = checkTestStrategyCoverage([task({})], coverage, LLD_STRATEGY);
	assert.ok(issues.some(i => /unknown Task id 't9'/.test(i)), issues.join('; '));
});

test('checkTestStrategyCoverage: flags a Task with an empty tests[]', () => {
	const coverage: TestStrategyCoverage[] = [{ lldStrategyItem: 'unit: t1 works', coveredByTaskIds: ['t1'] }];
	const issues = checkTestStrategyCoverage([task({ tests: [] })], coverage, LLD_STRATEGY);
	assert.ok(issues.some(i => /empty tests\[\]/.test(i)), issues.join('; '));
});

test('checkTestStrategyCoverage: flags a coverage claim whose Task names no tests', () => {
	const coverage: TestStrategyCoverage[] = [
		{ lldStrategyItem: 'unit: t1 works', coveredByTaskIds: ['t1'] },
	];
	const tasks = [task({ id: 't1', tests: [] }), task({ id: 't2', order: 2, tests: [{ level: 'unit', name: 'x' }] })];
	const issues = checkTestStrategyCoverage(tasks, coverage, LLD_STRATEGY);
	assert.ok(issues.some(i => /claims Task 't1' but it names no tests/.test(i)), issues.join('; '));
});

test('checkTestStrategyCoverage: accepts one-to-many and many-to-one mappings', () => {
	const strat: TestStrategy = { ...LLD_STRATEGY, testLevels: [{ level: 'unit', purpose: 'x', subjects: ['A', 'B'] }] };
	const tasks = [
		task({ id: 't1', order: 1, tests: [{ level: 'unit', name: 'A' }] }),
		task({ id: 't2', order: 2, tests: [{ level: 'integration', name: 'B' }] }),
	];
	const coverage: TestStrategyCoverage[] = [
		{ lldStrategyItem: 'A', coveredByTaskIds: ['t1', 't2'] },   // one item, many tasks
		{ lldStrategyItem: 'B', coveredByTaskIds: ['t2'] },
	];
	assert.deepEqual(checkTestStrategyCoverage(tasks, coverage, strat), []);
});

// ---------------------------------------------------------------------------
// Renderer + marker + resolution + approval
// ---------------------------------------------------------------------------

function fixtureArtifact(): PlanArtifact {
	return {
		meta: {
			workflow: 'plan', runId: 'plan-run-1', repoPath: '/x', createdAt: '2026-01-01T00:00:00Z',
			model: 'client', elapsedMs: 1, repoIndexedAt: null, schemaVersion: 1,
			epicHash: HASH, epicSlug: 'tag-filtering', storyId: 's1',
			lldRunId: 'lld-run-1', lldEffectiveHash: 'deadbeef',
		},
		body: {
			tasks: [task({})],
			testStrategyCoverage: [{ lldStrategyItem: 'unit: t1 works', coveredByTaskIds: ['t1'] }],
		},
		citations: [...CITES],
	};
}

test('renderPlanMarkdown: leads with the PLAN- marker, renders the ordered task table + [[cN]]', () => {
	const md = renderPlanMarkdown(fixtureArtifact());
	const m = ARTIFACT_ID_MARKER_RE.exec(md.slice(0, 200));
	assert.ok(m !== null, 'no artifact marker');
	assert.equal(m![1], `PLAN-${HASH}-s1`);
	assert.ok(md.includes('# Plan: s1'));
	assert.ok(md.includes('| # | Task | Size | Depends on | Tests | Derived from |'));
	assert.ok(md.includes('[[c1]]'), 'task derivedFrom not rendered as a citation ref');
	assert.ok(md.includes('## Test-strategy coverage'));
});

test('renderPlanMarkdown output passes validateCitations (every citation grounded)', () => {
	const md = renderPlanMarkdown(fixtureArtifact());
	assert.equal(validateCitations(md, CITES).ok, true);
});

test('planArtifactPaths: slug-md under docs/plans + hash-json under .insrc/artifacts; hash fallback', () => {
	const p = planArtifactPaths('/repo', HASH, 's1', 'tag-filtering');
	assert.ok(p.md.endsWith('/docs/plans/PLAN-tag-filtering-s1.md'), p.md);
	assert.ok(p.json.endsWith(`/.insrc/artifacts/PLAN-${HASH}-s1.json`), p.json);
	const noSlug = planArtifactPaths('/repo', HASH, 's1');
	assert.ok(noSlug.md.endsWith(`/docs/plans/PLAN-${HASH}-s1.md`), noSlug.md);
});

test('jsonPathForMd resolves a rendered plan md back to its canonical json; approve sets approvedAt', () => {
	const repo = mkdtempSync(join(tmpdir(), 'insrc-plan-art-'));
	try {
		const paths = planArtifactPaths(repo, HASH, 's1', 'tag-filtering');
		writeAtomic(paths.md, renderPlanMarkdown(fixtureArtifact()));
		writeAtomic(paths.json, JSON.stringify(fixtureArtifact(), null, 2) + '\n');
		assert.equal(jsonPathForMd(paths.md), paths.json);
		const res = approveArtifactByJsonPath(paths.json);
		assert.equal(res.workflow, 'plan');
		assert.ok(res.approvedAt.length > 0);
	} finally {
		rmSync(repo, { recursive: true, force: true });
	}
});

test('isPlanBody guards the tasks + testStrategyCoverage shape', () => {
	assert.equal(isPlanBody({ tasks: [], testStrategyCoverage: [] }), true);
	assert.equal(isPlanBody({ tasks: [] }), false);
	assert.equal(isPlanBody(null), false);
});
