/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * End-to-end `design.story` (LLD) walk. Pre-seeds an approved Define
 * artifact + an approved HLD, then walks:
 *   start → plan → 8× step (s7 short-circuits for new-capability) → synthesize.
 *
 * Coverage:
 *   - Happy path (enhancement flavor) — LLD written under docs/designs/<slug>/<storyId>.md.
 *   - Happy path (new-capability flavor) — s7 skipped; artifact has no migration section.
 *   - Refuses without approved HLD.
 *   - Refuses without epicHash or storyId param.
 *   - Unknown shared-contract id in interactionWithShared → hard-fail.
 *   - implements-role mismatch (Story doesn't own the contract per HLD) → hard-fail.
 *   - Missing acceptance mapping → hard-fail.
 *   - Migration missing for enhancement flavor → hard-fail.
 *   - Migration present for new-capability flavor → hard-fail.
 *
 * Run:
 *   npx tsx --test src/insrc/mcp/workflow-step/__tests__/design-story-e2e.test.ts
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { defineArtifactPaths, hldArtifactPaths } from '../../../workflow/storage.js';

const HASH = 'a3f4b8c9d1e2f3a4';
const MISSING_HASH = '0000000000000000';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { handleWorkflowStep } from '../handler.js';
import { registerWorkflowRunners } from '../../../workflow/index.js';
import { _clearWorkflowStateStoreForTests } from '../state-store.js';
import { approveArtifactByJsonPath } from '../../../workflow/gates.js';

interface Envelope { readonly content: readonly { readonly type: 'text'; readonly text: string }[]; readonly isError?: boolean }

function payload(env: Envelope): Record<string, unknown> {
	const first = env.content[0];
	assert.ok(first !== undefined);
	return JSON.parse(first.text) as Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// Fixture: pre-seed approved Define + approved HLD
// ---------------------------------------------------------------------------

interface SeedOpts { readonly flavor: 'enhancement' | 'new-capability' }

function seed(repo: string, epicHash: string, opts: SeedOpts): void {
	// Approved Define
	const definePaths = defineArtifactPaths(repo, epicHash);
	mkdirSync(dirname(definePaths.json), { recursive: true });
	const definePath = definePaths.json;
	writeFileSync(definePath, JSON.stringify({
		meta: { workflow: 'define', runId: 'define-1', schemaVersion: 1, epicHash, epicSlug: 'tag-filtering' },
		body: {
			flavor: opts.flavor,
			problem: 'Users cannot filter todos by tag.',
			nonGoals: [],
			assumptions: [{ text: 'Todos have tags', confidence: 'high', source: 'c1' }],
			constraints: [{ id: 'k1', text: 'Reuse sidebar', type: 'convention', source: 'c1' }],
			stories: [
				{ id: 's1', title: 'Filter by tag', userValue: 'v', acceptanceCriteria: [{ id: 'ac1', given: 'x', when: 'y', then: 'z', operationalizes: ['k1'] }] },
				{ id: 's2', title: 'Clear filter',  userValue: 'v', acceptanceCriteria: [{ id: 'ac1', given: 'x', when: 'y', then: 'z', operationalizes: ['k1'] }] },
			],
			openQuestions: [],
		},
		citations: [{ id: 'c1', kind: 'analyze-bundle', ref: 'todos module' }],
	}, null, 2));
	approveArtifactByJsonPath(definePath);

	// Approved HLD
	const hldPaths = hldArtifactPaths(repo, epicHash);
	mkdirSync(dirname(hldPaths.json), { recursive: true });
	const hldPath = hldPaths.json;
	writeFileSync(hldPath, JSON.stringify({
		meta: { workflow: 'design.epic', runId: 'hld-run-1', schemaVersion: 1, epicHash, epicSlug: 'tag-filtering' },
		body: {
			frameworkSummary: 'Extract TagFilter service.',
			architectureShape: 'TagFilter owns the tag index [[c1]]; sidebar consumes it.',
			sharedContracts: [
				{
					id: 'sc1', name: 'TagFilterAPI', purpose: 'Query todos by a single tag',
					interfaceSketch: 'interface TagFilterAPI { list(tag: string): Todo[] }',
					ownedByStory: 's1', consumedByStories: ['s2'], assumptions: ['c1'],
				},
			],
			storyBoundaries: [
				{ storyId: 's1', owns: ['sc1'], depends: [], internal: 'index storage private' },
				{ storyId: 's2', owns: [], depends: ['sc1'], internal: 'UI state private' },
			],
			nonFunctional: { performance: 'P50 < 20ms' },
			rolloutOverview: {
				phases: [
					{ name: 'Phase A', includesStories: ['s1'], rationale: 'contract first', backwardCompat: '', featureFlag: null },
					{ name: 'Phase B', includesStories: ['s2'], rationale: 'consumer next', backwardCompat: '', featureFlag: null },
				],
				orderingRationale: 's2 depends on sc1',
				riskyBits: [],
			},
			alternativesConsidered: [
				{ id: 'a1', name: 'Service', oneLineSummary: 'x', approach: 'own the index', pros: ['x'], cons: ['x'], costEstimate: 'S' },
				{ id: 'a2', name: 'Inline',  oneLineSummary: 'x', approach: 'sidebar scans', pros: ['x'], cons: ['x'], costEstimate: 'XS', reasonRejected: 'perf' },
			],
			chosenAlternative: 'a1',
			openQuestions: [],
		},
		citations: [{ id: 'c1', kind: 'analyze-bundle', ref: 'todos module' }],
	}, null, 2));
	approveArtifactByJsonPath(hldPath);
}

// ---------------------------------------------------------------------------
// Canned LLM responses
// ---------------------------------------------------------------------------

const s1LldContext = {
	analyzeBundles: [
		{ kind: 'symbol.locate', focus: 'TagFilterAPI', summary: 'not yet implemented — new symbol', pathsCited: ['src/todos/filter.ts'] },
	],
};

const s2Alternatives = {
	alternatives: [
		{ id: 'a1', name: 'In-memory tag index', oneLineSummary: 'index sits in RAM',
		  approach: 'The service keeps a tag→todos map warm; updates on todo mutation.',
		  pros: ['fast lookup'], cons: ['memory scales with tags'], costEstimate: 'S' },
		{ id: 'a2', name: 'DB view', oneLineSummary: 'compute on-query via SQL view',
		  approach: 'A materialised view exposes the tag filter; refreshed on write.',
		  pros: ['always fresh'], cons: ['DB coupling'], costEstimate: 'M' },
	],
};

const s3Judgment = {
	judgments: [
		{ alternativeId: 'a1', constraintScore: [{ constraintId: 'ac1', verdict: 'satisfies' }, { constraintId: 'sc1', verdict: 'satisfies' }], winnerRank: 1, rationale: 'satisfies both' },
		{ alternativeId: 'a2', constraintScore: [{ constraintId: 'ac1', verdict: 'partial'    }, { constraintId: 'sc1', verdict: 'satisfies' }], winnerRank: 2, rationale: 'partial ac1' },
	],
	winnerId: 'a1',
	winnerRationale: 'a1 satisfies ac1 fully.',
};

const s4ContractDetail = {
	surfaceLevel: 'internal-shared' as const,
	api: [
		{
			name: 'TagFilterAPI.list',
			signature: 'list(tag: string): Todo[]',
			parameters: [{ name: 'tag', type: 'string', purpose: 'the tag to filter by', optional: false }],
			returns: { type: 'Todo[]', meaning: 'todos tagged with `tag`' },
			errors: [{ type: 'UnknownTagError', condition: 'when the tag is not registered' }],
			preconditions:  ['tag is a non-empty string'],
			postconditions: ['returned Todo[] sorted by createdAt desc'],
		},
	],
	dataModel: [{ entity: 'Todo', change: 'invariant-change' as const, details: 'add tag index invariant', callSites: ['src/todos/store.ts:filter'] }],
	interactionWithShared: [
		{ contractId: 'sc1', role: 'implements' as const, howDetails: 's1 owns TagFilterAPI as the primary implementation' },
	],
};

const s5ErrorPaths = {
	errorCases: [{ scenario: 'unknown tag', detection: 'lookup miss in tag registry', response: 'throw UnknownTagError', userImpact: 'empty results', recoverable: true }],
	edgeCases:  [{ input: 'empty tag string', expected: 'return empty array without error' }],
	invariantsToPreserve: [{ text: 'existing status filter still works', source: 'c1' }],
};

const s6TestStrategy = {
	testLevels: [{ level: 'unit' as const, purpose: 'list() valid/invalid tags', subjects: ['TagFilterAPI.list'] }],
	acceptanceMapping: [{ criterionId: 'ac1', provingTests: ['unit:TagFilterAPI.list'] }],
	testFramework: 'node:test',
};

const s7Migration = {
	stateBefore: 'todos support status filter but not tag filter',
	stateAfter:  'todos support both status and tag filter',
	migrationSteps: [
		{ order: 1, action: 'add tag index (nullable, lazy build)', rollbackable: true },
		{ order: 2, action: 'flip TagFilterAPI to serve from the index', rollbackable: true, prerequisiteFlags: ['tag-index-ready'] },
	],
	backwardCompat: 'existing status filter path unchanged',
	zeroDowntime: true,
	dataRewriteRequired: false,
};

const s8PassedVerdict = {
	results: [
		{ itemId: 'sbdry1', verdict: 'passed', evidence: 's4' },
		{ itemId: 'sbdry2', verdict: 'passed', evidence: 's4' },
		{ itemId: 'sbdry3', verdict: 'passed', evidence: 's4' },
		{ itemId: 'sbdry4', verdict: 'passed', evidence: 's4' },
	],
};

function makeArtifact(hldSlice: Record<string, unknown>, includeMigration: boolean): Record<string, unknown> {
	return {
		body: {
			hldContextSlice: hldSlice,
			contractDetails: {
				surfaceLevel: s4ContractDetail.surfaceLevel,
				api:          s4ContractDetail.api,
			},
			dataModelChanges: s4ContractDetail.dataModel,
			interactionWithShared: s4ContractDetail.interactionWithShared,
			errorPaths: s5ErrorPaths,
			testStrategy: s6TestStrategy,
			...(includeMigration ? { migration: s7Migration } : {}),
			alternativesConsidered: [
				s2Alternatives.alternatives[0],
				{ ...s2Alternatives.alternatives[1], reasonRejected: 'partial ac1' },
			],
			chosenAlternative: 'a1',
			openQuestions: [],
		},
		citations: [{ id: 'c1', kind: 'analyze-bundle', ref: 'todos module' }],
	};
}

// The hldSlice that s1 (as owner) should carry through — computed
// off the seeded HLD.
const hldSliceForS1 = {
	frameworkSummary: 'Extract TagFilter service.',
	ownedContracts: [{
		id: 'sc1', name: 'TagFilterAPI', purpose: 'Query todos by a single tag',
		interfaceSketch: 'interface TagFilterAPI { list(tag: string): Todo[] }',
		ownedByStory: 's1', consumedByStories: ['s2'], assumptions: ['c1'],
	}],
	consumedContracts: [],
	boundary: { storyId: 's1', owns: ['sc1'], depends: [], internal: 'index storage private' },
	rolloutPhase: 'Phase A',
	nonFunctional: { performance: 'P50 < 20ms' },
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function walkToSynthesize(
	repo:     string,
	epicHash: string,
	storyId:  string,
	s7Resp:   Record<string, unknown> | null,
	s8Resp:   Record<string, unknown>,
): Promise<string> {
	const startOut = payload(await handleWorkflowStep({
		phase:    'start',
		workflow: 'design.story',
		focus:    'LLD for tag filtering story s1',
		repo,
		params:   { epicHash, storyId },
	}));
	assert.equal(startOut['next'], 'emit_plan', JSON.stringify(startOut));
	let state = startOut['state'] as string;

	const planOut = payload(await handleWorkflowStep({
		phase: 'plan',
		plan: {
			workflow: 'design.story',
			steps: [
				{ id: 's1', runner: 'context.assemble',       params: {} },
				{ id: 's2', runner: 'alternatives.enumerate', params: {} },
				{ id: 's3', runner: 'alternatives.judge',     params: {} },
				{ id: 's4', runner: 'contract.detail',        params: {} },
				{ id: 's5', runner: 'error.paths',            params: {} },
				{ id: 's6', runner: 'test.strategy',          params: {} },
				{ id: 's7', runner: 'migration.write',        params: {} },
				{ id: 's8', runner: 'checklist.verify',       params: {} },
			],
		},
		state,
	}));
	assert.equal(planOut['next'], 'emit_step', JSON.stringify(planOut));
	state = planOut['state'] as string;

	// s1..s6 are always LLM pauses. s7 is conditional: for enhancement
	// it pauses, for new-capability it short-circuits (skipped).
	const steps: Array<{ id: string; response: Record<string, unknown> | null }> = [
		{ id: 's1', response: s1LldContext },
		{ id: 's2', response: s2Alternatives },
		{ id: 's3', response: s3Judgment },
		{ id: 's4', response: s4ContractDetail },
		{ id: 's5', response: s5ErrorPaths },
		{ id: 's6', response: s6TestStrategy },
		{ id: 's7', response: s7Resp },
		{ id: 's8', response: s8Resp },
	];
	for (const step of steps) {
		if (step.id === 's7' && step.response === null) continue;   // executor auto-advances
		const out = payload(await handleWorkflowStep({
			phase:    'step',
			stepId:   step.id,
			response: step.response!,
			state,
		}));
		if (step.id === 's8') {
			assert.equal(out['next'], 'emit_synthesize', JSON.stringify(out));
		} else {
			assert.equal(out['next'], 'emit_step', `at ${step.id}: ${JSON.stringify(out)}`);
		}
		state = out['state'] as string;
	}
	return state;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

test('design.story enhancement: happy path writes LLD under docs/designs/<slug>/<storyId>.md', async () => {
	_clearWorkflowStateStoreForTests();
	registerWorkflowRunners();
	const repo = mkdtempSync(join(tmpdir(), 'insrc-lld-e2e-'));
	const slug = HASH;
	try {
		seed(repo, slug, { flavor: 'enhancement' });
		const state = await walkToSynthesize(repo, slug, 's1', s7Migration, s8PassedVerdict);
		const done = payload(await handleWorkflowStep({
			phase:    'synthesize',
			artifact: makeArtifact(hldSliceForS1, true),
			state,
		}));
		assert.equal(done['next'], 'done', JSON.stringify(done));
		const outPath = done['path'] as string;
		assert.ok(outPath.endsWith(`/docs/designs/LLD-${HASH}-s1.md`), outPath);
		assert.ok(existsSync(outPath));
		const md = readFileSync(outPath, 'utf8');
		assert.ok(md.includes('# LLD: s1'));
		assert.ok(md.includes('## Contract details'));
		assert.ok(md.includes('## Migration'));
		assert.ok(md.includes('1. add tag index'));
	} finally {
		rmSync(repo, { recursive: true, force: true });
	}
});

test('design.story new-capability: s7 skips, artifact has no Migration section', async () => {
	_clearWorkflowStateStoreForTests();
	registerWorkflowRunners();
	const repo = mkdtempSync(join(tmpdir(), 'insrc-lld-e2e-'));
	const slug = HASH;
	try {
		seed(repo, slug, { flavor: 'new-capability' });
		const state = await walkToSynthesize(repo, slug, 's1', /* s7 */ null, s8PassedVerdict);
		const done = payload(await handleWorkflowStep({
			phase:    'synthesize',
			artifact: makeArtifact(hldSliceForS1, false),
			state,
		}));
		assert.equal(done['next'], 'done', JSON.stringify(done));
		const md = readFileSync(done['path'] as string, 'utf8');
		assert.ok(!md.includes('## Migration'), 'new-capability LLD should have no Migration section');
	} finally {
		rmSync(repo, { recursive: true, force: true });
	}
});

test('design.story: refuses without an approved HLD', async () => {
	_clearWorkflowStateStoreForTests();
	registerWorkflowRunners();
	const repo = mkdtempSync(join(tmpdir(), 'insrc-lld-e2e-'));
	const slug = HASH;
	try {
		// Seed only Define, not HLD.
		mkdirSync(join(repo, 'docs/defines'), { recursive: true });
		const definePath = join(repo, 'docs/defines', `${slug}.json`);
		writeFileSync(definePath, JSON.stringify({
			meta: { workflow: 'define', runId: 'x', schemaVersion: 1 },
			body: { flavor: 'enhancement', problem: 'x', nonGoals: [], assumptions: [], constraints: [],
				stories: [{ id: 's1', title: 't', userValue: 'v', acceptanceCriteria: [] }], openQuestions: [] },
			citations: [],
		}, null, 2));
		approveArtifactByJsonPath(definePath);

		const startOut = payload(await handleWorkflowStep({
			phase: 'start', workflow: 'design.story', focus: 'x', repo,
			params: { epicHash: slug, storyId: 's1' },
		}));
		const state = startOut['state'] as string;
		const planOut = payload(await handleWorkflowStep({
			phase: 'plan',
			plan: {
				workflow: 'design.story',
				steps: [
					{ id: 's1', runner: 'context.assemble',       params: {} },
					{ id: 's2', runner: 'alternatives.enumerate', params: {} },
					{ id: 's3', runner: 'alternatives.judge',     params: {} },
					{ id: 's4', runner: 'contract.detail',        params: {} },
					{ id: 's5', runner: 'error.paths',            params: {} },
					{ id: 's6', runner: 'test.strategy',          params: {} },
					{ id: 's7', runner: 'migration.write',        params: {} },
					{ id: 's8', runner: 'checklist.verify',       params: {} },
				],
			},
			state,
		}));
		assert.equal(planOut['next'], 'error');
	} finally {
		rmSync(repo, { recursive: true, force: true });
	}
});

test('design.story: refuses without epicHash or storyId params', async () => {
	_clearWorkflowStateStoreForTests();
	registerWorkflowRunners();
	const repo = mkdtempSync(join(tmpdir(), 'insrc-lld-e2e-'));
	try {
		const errOut = payload(await handleWorkflowStep({
			phase: 'start', workflow: 'design.story', focus: 'x', repo,
			params: { epicHash: HASH }, // missing storyId
		}));
		assert.equal(errOut['next'], 'error');
	} finally {
		rmSync(repo, { recursive: true, force: true });
	}
});

test('design.story: unknown shared-contract id fails synthesize', async () => {
	_clearWorkflowStateStoreForTests();
	registerWorkflowRunners();
	const repo = mkdtempSync(join(tmpdir(), 'insrc-lld-e2e-'));
	const slug = HASH;
	try {
		seed(repo, slug, { flavor: 'enhancement' });
		const state = await walkToSynthesize(repo, slug, 's1', s7Migration, s8PassedVerdict);
		const bad = makeArtifact(hldSliceForS1, true);
		(bad.body as { interactionWithShared: unknown[] }).interactionWithShared = [
			{ contractId: 'sc99', role: 'implements', howDetails: 'x' },
		];
		const errOut = payload(await handleWorkflowStep({
			phase: 'synthesize', artifact: bad, state,
		}));
		assert.equal(errOut['next'], 'error');
		assert.match((errOut['error'] as { message: string }).message, /sc99/);
	} finally {
		rmSync(repo, { recursive: true, force: true });
	}
});

test('design.story: migration MISSING for enhancement Epic → hard-fail', async () => {
	_clearWorkflowStateStoreForTests();
	registerWorkflowRunners();
	const repo = mkdtempSync(join(tmpdir(), 'insrc-lld-e2e-'));
	const slug = HASH;
	try {
		seed(repo, slug, { flavor: 'enhancement' });
		const state = await walkToSynthesize(repo, slug, 's1', s7Migration, s8PassedVerdict);
		const errOut = payload(await handleWorkflowStep({
			phase: 'synthesize', artifact: makeArtifact(hldSliceForS1, /* migration */ false), state,
		}));
		assert.equal(errOut['next'], 'error');
		assert.match((errOut['error'] as { message: string }).message, /enhancement/);
	} finally {
		rmSync(repo, { recursive: true, force: true });
	}
});

test('design.story: migration PRESENT for new-capability Epic → hard-fail', async () => {
	_clearWorkflowStateStoreForTests();
	registerWorkflowRunners();
	const repo = mkdtempSync(join(tmpdir(), 'insrc-lld-e2e-'));
	const slug = HASH;
	try {
		seed(repo, slug, { flavor: 'new-capability' });
		const state = await walkToSynthesize(repo, slug, 's1', null, s8PassedVerdict);
		const errOut = payload(await handleWorkflowStep({
			phase: 'synthesize', artifact: makeArtifact(hldSliceForS1, true), state,
		}));
		assert.equal(errOut['next'], 'error');
		assert.match((errOut['error'] as { message: string }).message, /new-capability/);
	} finally {
		rmSync(repo, { recursive: true, force: true });
	}
});
