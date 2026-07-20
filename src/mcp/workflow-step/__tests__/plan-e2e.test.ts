/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * End-to-end `plan` walk. Pre-seeds an approved Define + HLD + LLD, then
 * walks start → plan → 6× step → synthesize, and checks:
 *   - Happy path writes a PlanArtifact under docs/plans/PLAN-<slug>-<storyId>.md.
 *   - The persisted tasks are ordered / sized / dependency-labelled with tests.
 *   - The written md resolves back to its json and is approvable.
 *   - Refuses at the gate when the Story LLD is unapproved.
 *   - Refuses at the gate when the Story LLD is stale (no ack).
 *   - finalize rejects a task graph with a dangling dependsOn.
 *
 * Run: npx tsx --test src/mcp/workflow-step/__tests__/plan-e2e.test.ts
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { tmpdir } from 'node:os';

import { handleWorkflowStep } from '../handler.js';
import { registerWorkflowRunners } from '../../../workflow/index.js';
import { _clearWorkflowStateStoreForTests } from '../state-store.js';
import { approveArtifactByJsonPath, jsonPathForMd } from '../../../workflow/gates.js';
import { computeHldEffectiveHash } from '../../../workflow/artifacts/lld.js';
import { defineArtifactPaths, hldArtifactPaths, lldArtifactPaths } from '../../../workflow/storage.js';

const HASH = 'a3f4b8c9d1e2f3a4';
const HLD_RUN = 'hld-run-1';
const CURRENT_EFFECTIVE = computeHldEffectiveHash(HLD_RUN, []);

interface Envelope { readonly content: readonly { readonly type: 'text'; readonly text: string }[]; readonly isError?: boolean }
function payload(env: Envelope): Record<string, unknown> {
	const first = env.content[0];
	assert.ok(first !== undefined);
	return JSON.parse(first.text) as Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// Fixture: approved Define + HLD + LLD (LLD approval/staleness configurable)
// ---------------------------------------------------------------------------

interface SeedOpts { readonly lldApproved: boolean; readonly lldEffectiveHash?: string }

function seed(repo: string, opts: SeedOpts): void {
	const dp = defineArtifactPaths(repo, HASH);
	mkdirSync(dirname(dp.json), { recursive: true });
	writeFileSync(dp.json, JSON.stringify({
		meta: { workflow: 'define', runId: 'def-1', schemaVersion: 1, epicHash: HASH, epicSlug: 'tag-filtering' },
		body: {
			flavor: 'enhancement', problem: 'x', nonGoals: [], assumptions: [], constraints: [],
			stories: [{ id: 's1', title: 'Filter by tag', userValue: 'v', acceptanceCriteria: [{ id: 'ac1', given: 'a', when: 'b', then: 'c', operationalizes: [] }], dependsOn: [] }],
			openQuestions: [],
		},
		citations: [],
	}, null, 2));
	approveArtifactByJsonPath(dp.json);

	const hp = hldArtifactPaths(repo, HASH);
	writeFileSync(hp.json, JSON.stringify({
		meta: { workflow: 'design.epic', runId: HLD_RUN, schemaVersion: 1, epicHash: HASH, epicSlug: 'tag-filtering' },
		body: {
			frameworkSummary: 'x', architectureShape: 'x [[c1]]',
			sharedContracts: [{ id: 'sc1', name: 'A', purpose: 'p', interfaceSketch: 'interface A {}', ownedByStory: 's1', consumedByStories: [], assumptions: [] }],
			storyBoundaries: [{ storyId: 's1', owns: ['sc1'], depends: [], internal: 'x' }],
			nonFunctional: {},
			rolloutOverview: { phases: [{ name: 'A', includesStories: ['s1'], rationale: 'x', backwardCompat: '', featureFlag: null }], orderingRationale: 'x', riskyBits: [] },
			alternativesConsidered: [{ id: 'a1', name: 'x', oneLineSummary: 'x', approach: 'x', pros: ['x'], cons: ['x'], costEstimate: 'S' }],
			chosenAlternative: 'a1', openQuestions: [],
		},
		citations: [{ id: 'c1', kind: 'analyze-bundle', ref: 'x' }],
	}, null, 2));
	approveArtifactByJsonPath(hp.json);

	const lp = lldArtifactPaths(repo, HASH, 's1');
	const meta: Record<string, unknown> = {
		workflow: 'design.story', runId: 'lld-run-1', schemaVersion: 1, epicHash: HASH, epicSlug: 'tag-filtering', storyId: 's1',
		hldBaseRunId: HLD_RUN, hldEffectiveHash: opts.lldEffectiveHash ?? CURRENT_EFFECTIVE, hldAmendmentsApplied: [],
	};
	writeFileSync(lp.json, JSON.stringify({
		meta,
		body: {
			hldContextSlice: {}, contractDetails: { surfaceLevel: 'internal', api: [] },
			dataModelChanges: [], interactionWithShared: [],
			errorPaths: { errorCases: [], edgeCases: [], invariantsToPreserve: [] },
			testStrategy: { testLevels: [{ level: 'unit', purpose: 'x', subjects: ['unit: filter by tag'] }], acceptanceMapping: [{ criterionId: 'ac1', provingTests: ['unit: filter by tag'] }], testFramework: 'node:test' },
			alternativesConsidered: [{ id: 'a1', name: 'x', oneLineSummary: 'x', approach: 'x', pros: [], cons: [], costEstimate: 'S' }],
			chosenAlternative: 'a1', openQuestions: [],
		},
		citations: [],
	}, null, 2));
	if (opts.lldApproved) approveArtifactByJsonPath(lp.json);
}

// ---------------------------------------------------------------------------
// Canned LLM step responses
// ---------------------------------------------------------------------------

const taskCore = { id: 't1', title: 'Implement the tag filter', summary: 'Add the filter path.', size: 'M', order: 1, dependsOn: [], acceptanceChecks: ['filter returns tagged todos'], derivedFrom: ['c1'] };
const s1Context  = { analyzeBundles: [{ kind: 'symbol.locate', focus: 'filter', summary: 'new path', pathsCited: ['src/todos/filter.ts'] }] };
const s2Enumerate = { tasks: [taskCore] };
const s3Critique  = { critiques: [], overallOk: true };
const s4Finalize  = { tasks: [taskCore] };
const s5TestStrategy = {
	tasks: [{ ...taskCore, tests: [{ level: 'unit', name: 'unit: filter by tag' }] }],
	testStrategyCoverage: [{ lldStrategyItem: 'unit: filter by tag', coveredByTaskIds: ['t1'] }],
};
const s6Checklist = { results: [{ itemId: 't1', verdict: 'passed', evidence: 's5' }] };

const PLAN_STEPS = [
	{ id: 's1', runner: 'context.assemble',    params: {} },
	{ id: 's2', runner: 'tasks.enumerate',     params: {} },
	{ id: 's3', runner: 'tasks.critique',      params: {} },
	{ id: 's4', runner: 'tasks.finalize',      params: {} },
	{ id: 's5', runner: 'test-strategy.write', params: {} },
	{ id: 's6', runner: 'checklist.verify',    params: {} },
];

async function startAndPlan(repo: string): Promise<{ state: string; planNext: string; planOut: Record<string, unknown> }> {
	const startOut = payload(await handleWorkflowStep({
		phase: 'start', workflow: 'plan', focus: 'plan for tag filtering s1', repo, params: { epicHash: HASH, storyId: 's1' },
	}));
	assert.equal(startOut['next'], 'emit_plan', JSON.stringify(startOut));
	const planOut = payload(await handleWorkflowStep({
		phase: 'plan', plan: { workflow: 'plan', steps: PLAN_STEPS }, state: startOut['state'] as string,
	}));
	return { state: planOut['state'] as string, planNext: planOut['next'] as string, planOut };
}

async function walkToSynthesize(repo: string): Promise<string> {
	const { state: afterPlan, planNext, planOut } = await startAndPlan(repo);
	assert.equal(planNext, 'emit_step', JSON.stringify(planOut));
	let state = afterPlan;
	const steps: Array<{ id: string; response: Record<string, unknown> }> = [
		{ id: 's1', response: s1Context },
		{ id: 's2', response: s2Enumerate },
		{ id: 's3', response: s3Critique },
		{ id: 's4', response: s4Finalize },
		{ id: 's5', response: s5TestStrategy },
		{ id: 's6', response: s6Checklist },
	];
	for (const step of steps) {
		const out = payload(await handleWorkflowStep({ phase: 'step', stepId: step.id, response: step.response, state }));
		if (step.id === 's6') assert.equal(out['next'], 'emit_synthesize', JSON.stringify(out));
		else assert.equal(out['next'], 'emit_step', `at ${step.id}: ${JSON.stringify(out)}`);
		state = out['state'] as string;
	}
	return state;
}

const synthArtifact = {
	body: { tasks: s5TestStrategy.tasks, testStrategyCoverage: s5TestStrategy.testStrategyCoverage },
	citations: [{ id: 'c1', kind: 'prior-artifact', ref: 'LLD s1 contractDetails' }],
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

test('plan happy path: writes a PlanArtifact under docs/plans/PLAN-<slug>-s1.md', async () => {
	_clearWorkflowStateStoreForTests();
	registerWorkflowRunners();
	const repo = mkdtempSync(join(tmpdir(), 'insrc-plan-e2e-'));
	try {
		seed(repo, { lldApproved: true });
		const state = await walkToSynthesize(repo);
		const done = payload(await handleWorkflowStep({ phase: 'synthesize', artifact: synthArtifact, state }));
		assert.equal(done['next'], 'done', JSON.stringify(done));
		const outPath = done['path'] as string;
		assert.ok(outPath.endsWith('/docs/plans/PLAN-tag-filtering-s1.md'), outPath);
		assert.ok(existsSync(outPath));
		const md = readFileSync(outPath, 'utf8');
		// With a valid createdAt the title leads with the hierarchical story id.
		assert.ok(/# Plan: E\d{8}[0-9a-f]{8}:S001\b/.test(md), md.split('\n').find(l => l.startsWith('# Plan:')));
		assert.ok(md.includes('**`t1`**'));
		assert.ok(md.includes('| 1 |'));               // ordered
		assert.ok(md.includes('unit: filter by tag')); // tests rendered
		// The written md resolves to its json and is approvable.
		const jsonPath = jsonPathForMd(outPath);
		assert.ok(jsonPath.endsWith(`/.insrc/artifacts/PLAN-${HASH}-s1.json`), jsonPath);
		const res = approveArtifactByJsonPath(jsonPath);
		assert.equal(res.workflow, 'plan');
	} finally { rmSync(repo, { recursive: true, force: true }); }
});

test('plan: refuses when the Story LLD is unapproved (gate)', async () => {
	_clearWorkflowStateStoreForTests();
	registerWorkflowRunners();
	const repo = mkdtempSync(join(tmpdir(), 'insrc-plan-e2e-'));
	try {
		seed(repo, { lldApproved: false });
		const { planNext, planOut } = await startAndPlan(repo);
		// The gate runs at the first step's prompt build → the run errors.
		assert.equal(planNext, 'error', JSON.stringify(planOut));
	} finally { rmSync(repo, { recursive: true, force: true }); }
});

test('plan: refuses when the Story LLD is stale with no ack (gate)', async () => {
	_clearWorkflowStateStoreForTests();
	registerWorkflowRunners();
	const repo = mkdtempSync(join(tmpdir(), 'insrc-plan-e2e-'));
	try {
		seed(repo, { lldApproved: true, lldEffectiveHash: 'a-stale-hash' });
		const { planNext, planOut } = await startAndPlan(repo);
		assert.equal(planNext, 'error', JSON.stringify(planOut));
		assert.match((planOut['error'] as { message: string }).message, /stale/);
	} finally { rmSync(repo, { recursive: true, force: true }); }
});

test('plan: finalize rejects a task graph with a dangling dependsOn', async () => {
	_clearWorkflowStateStoreForTests();
	registerWorkflowRunners();
	const repo = mkdtempSync(join(tmpdir(), 'insrc-plan-e2e-'));
	try {
		seed(repo, { lldApproved: true });
		const state = await walkToSynthesize(repo);
		const bad = {
			body: {
				tasks: [{ ...s5TestStrategy.tasks[0], dependsOn: ['t9'] }],
				testStrategyCoverage: s5TestStrategy.testStrategyCoverage,
			},
			citations: synthArtifact.citations,
		};
		const errOut = payload(await handleWorkflowStep({ phase: 'synthesize', artifact: bad, state }));
		assert.equal(errOut['next'], 'error', JSON.stringify(errOut));
		assert.match((errOut['error'] as { message: string }).message, /t9|cross-artifact/);
	} finally { rmSync(repo, { recursive: true, force: true }); }
});
