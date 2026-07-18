/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * End-to-end `build` start-turn walk (Story s1, ac2). Proves a developer
 * drives `build` through the IDENTICAL stage-agnostic MCP surface used by
 * every earlier stage — no bespoke input/phase type, no new dispatcher
 * arm:
 *
 *   - handleWorkflowStep({ phase:'start', workflow:'build', focus,
 *     params:{ epicHash, storyId } }) advances to next:'emit_plan'.
 *   - Emitting the 2-step build plan advances to next:'emit_step'
 *     (the executor dispatched the build runner + the plan gate passed).
 *   - The build gate refuses at the first step when the plan is unapproved.
 *
 * Backed by a stub approved-plan fixture written through the existing
 * storage writers.
 *
 * Run: npx tsx --test src/mcp/workflow-step/__tests__/build-e2e.test.ts
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { tmpdir } from 'node:os';

import { handleWorkflowStep } from '../handler.js';
import { registerWorkflowRunners } from '../../../workflow/index.js';
import { _clearWorkflowStateStoreForTests } from '../state-store.js';
import { approveArtifactByJsonPath } from '../../../workflow/gates.js';
import { planArtifactPaths } from '../../../workflow/storage.js';

const HASH = 'a3f4b8c9d1e2f3a4';

interface Envelope { readonly content: readonly { readonly type: 'text'; readonly text: string }[]; readonly isError?: boolean }
function payload(env: Envelope): Record<string, unknown> {
	const first = env.content[0];
	assert.ok(first !== undefined);
	return JSON.parse(first.text) as Record<string, unknown>;
}

// A stub approved plan (the build stage's upstream authorization boundary),
// written through the existing storage writers.
function seedPlan(repo: string, approved: boolean): void {
	const pp = planArtifactPaths(repo, HASH, 's1');
	mkdirSync(dirname(pp.json), { recursive: true });
	writeFileSync(pp.json, JSON.stringify({
		meta: {
			workflow: 'plan', runId: 'plan-run-1', schemaVersion: 1,
			epicHash: HASH, epicSlug: 'tag-filtering', storyId: 's1',
			lldRunId: 'lld-run-1', lldEffectiveHash: 'deadbeef',
		},
		body: {
			tasks: [{
				id: 't1', title: 'Implement the tag filter', summary: 'Add the filter path.',
				size: 'M', order: 1, dependsOn: [], acceptanceChecks: ['works'], derivedFrom: ['c1'],
				tests: [{ level: 'unit', name: 'unit: filter by tag' }],
			}],
			testStrategyCoverage: [{ lldStrategyItem: 'unit: filter by tag', coveredByTaskIds: ['t1'] }],
		},
		citations: [{ id: 'c1', kind: 'prior-artifact', ref: 'LLD s1' }],
	}, null, 2));
	if (approved) approveArtifactByJsonPath(pp.json);
}

const BUILD_STEPS = [
	{ id: 's1', runner: 'context.assemble', params: {} },
	{ id: 's2', runner: 'tasks.implement',  params: {} },
];

test("ac2: build start turn { phase:'start', workflow:'build', params:{ epicHash, storyId } } → emit_plan → emit_step", async () => {
	_clearWorkflowStateStoreForTests();
	registerWorkflowRunners();
	const repo = mkdtempSync(join(tmpdir(), 'insrc-build-e2e-'));
	try {
		seedPlan(repo, true);
		// start → emit_plan (through the SHARED stage-agnostic surface).
		const startOut = payload(await handleWorkflowStep({
			phase: 'start', workflow: 'build', focus: 'build tag filtering s1', repo,
			params: { epicHash: HASH, storyId: 's1' },
		}));
		assert.equal(startOut['next'], 'emit_plan', JSON.stringify(startOut));
		// plan → emit_step (executor dispatched the build runner; the plan gate passed).
		const planOut = payload(await handleWorkflowStep({
			phase: 'plan', plan: { workflow: 'build', steps: BUILD_STEPS }, state: startOut['state'] as string,
		}));
		assert.equal(planOut['next'], 'emit_step', JSON.stringify(planOut));
	} finally { rmSync(repo, { recursive: true, force: true }); }
});

test('ac2: build refuses at the gate when the plan is unapproved', async () => {
	_clearWorkflowStateStoreForTests();
	registerWorkflowRunners();
	const repo = mkdtempSync(join(tmpdir(), 'insrc-build-e2e-'));
	try {
		seedPlan(repo, false);
		const startOut = payload(await handleWorkflowStep({
			phase: 'start', workflow: 'build', focus: 'build tag filtering s1', repo,
			params: { epicHash: HASH, storyId: 's1' },
		}));
		assert.equal(startOut['next'], 'emit_plan', JSON.stringify(startOut));
		const planOut = payload(await handleWorkflowStep({
			phase: 'plan', plan: { workflow: 'build', steps: BUILD_STEPS }, state: startOut['state'] as string,
		}));
		// The gate runs at the first step's prompt build → the run errors.
		assert.equal(planOut['next'], 'error', JSON.stringify(planOut));
	} finally { rmSync(repo, { recursive: true, force: true }); }
});
