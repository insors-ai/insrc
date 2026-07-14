/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * End-to-end `design.epic` (HLD) walk. Pre-seeds an approved Define
 * artifact, then walks start → plan → 6× step → synthesize.
 *
 * Coverage:
 *   - Happy path: HLD written to docs/designs/<slug>/_hld.md.
 *   - Gate refusal: no approved Epic → context.assemble fails.
 *   - s6 sbdry1=missed → hard-fail.
 *   - Story coverage mismatch → hard-fail.
 *   - InterfaceSketch with function body → hard-fail.
 *
 * Run:
 *   npx tsx --test src/insrc/mcp/workflow-step/__tests__/design-epic-e2e.test.ts
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { defineArtifactPaths } from '../../../workflow/storage.js';

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
// Fixture: pre-seed an approved Define artifact
// ---------------------------------------------------------------------------

function seedApprovedDefine(repo: string, epicHash: string): void {
	const paths = defineArtifactPaths(repo, epicHash);
	mkdirSync(dirname(paths.json), { recursive: true });
	writeFileSync(paths.json, JSON.stringify({
		meta: { workflow: 'define', runId: 'define-1', schemaVersion: 1, epicHash, epicSlug: 'tag-filtering' },
		body: {
			flavor: 'enhancement',
			problem: 'Users cannot filter todos by tag. This blocks triage.',
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
	approveArtifactByJsonPath(paths.json);
}

// ---------------------------------------------------------------------------
// Canned LLM responses
// ---------------------------------------------------------------------------

const s1Context = {
	analyzeBundles: [
		{ kind: 'structural-map', focus: 'todos module', summary: 'has filter.ts, no tag path', pathsCited: ['src/todos/filter.ts'] },
	],
};

const s2Alternatives = {
	alternatives: [
		{ id: 'a1', name: 'Extract TagFilter service', oneLineSummary: 'Own the index in a service',
		  approach: 'Dedicated module owns the tag index and the query surface. The sidebar consumes it via a TagFilterAPI.',
		  pros: ['clear contract'], cons: ['more modules'], costEstimate: 'S' },
		{ id: 'a2', name: 'Inline in sidebar', oneLineSummary: 'Sidebar scans on-demand',
		  approach: 'Sidebar filters todos in-memory each time. Reuses the current listing loop.',
		  pros: ['no new module'], cons: ['O(n) per open'], costEstimate: 'XS' },
	],
};

const s3Judgment = {
	judgments: [
		{ alternativeId: 'a1', constraintScore: [{ constraintId: 'k1', verdict: 'satisfies' }], winnerRank: 1, rationale: 'satisfies k1' },
		{ alternativeId: 'a2', constraintScore: [{ constraintId: 'k1', verdict: 'partial'    }], winnerRank: 2, rationale: 'partial on k1' },
	],
	winnerId: 'a1',
	winnerRationale: 'a1 satisfies k1 while a2 only partially does.',
};

const s4Framework = {
	frameworkSummary:  'Extract a small TagFilter service that the todos sidebar consumes.',
	architectureShape: 'TagFilter owns the tag index over the existing todos module [[c1]] and returns filtered results. Sidebar mounts TagFilterPanel.',
	sharedContracts: [
		{
			id: 'sc1', name: 'TagFilterAPI', purpose: 'Query todos by a single tag',
			interfaceSketch: 'interface TagFilterAPI { list(tag: string): Todo[] }',
			ownedByStory: 's1', consumedByStories: ['s2'], assumptions: ['c1'],
		},
	],
	storyBoundaries: [
		{ storyId: 's1', owns: ['sc1'], depends: [],     internal: 'Index storage is s1-private.' },
		{ storyId: 's2', owns: [],      depends: ['sc1'], internal: 'Clear-filter UI is s2-local.' },
	],
	nonFunctional: { performance: 'list() P50 < 20ms on 10k todos' },
};

const s5Rollout = {
	phases: [
		{ name: 'Phase A — service', includesStories: ['s1'], rationale: 'contract lands first', backwardCompat: '', featureFlag: null },
		{ name: 'Phase B — UI',      includesStories: ['s2'], rationale: 'consumer wires up',    backwardCompat: '', featureFlag: null },
	],
	orderingRationale: 's2 depends on sc1 from s1.',
	riskyBits: [{ area: 'index memory', why: 'grows with tags', mitigation: 'LRU eviction' }],
};

const s6PassedVerdict = {
	results: [
		{ itemId: 'sbdry1', verdict: 'passed', evidence: 's4' },
		{ itemId: 'sbdry2', verdict: 'passed', evidence: 's4' },
		{ itemId: 'sbdry3', verdict: 'passed', evidence: 's4' },
		{ itemId: 'sbdry4', verdict: 'passed', evidence: 's4' },
	],
};

const s6BoundaryFailVerdict = {
	results: [
		{ itemId: 'sbdry1', verdict: 'missed', evidence: 's4', notes: 'sc1 sketch has a return statement' },
	],
};

const artifactJson = {
	body: {
		frameworkSummary:  s4Framework.frameworkSummary,
		architectureShape: s4Framework.architectureShape,
		sharedContracts:   s4Framework.sharedContracts,
		storyBoundaries:   s4Framework.storyBoundaries,
		nonFunctional:     s4Framework.nonFunctional,
		rolloutOverview:   s5Rollout,
		alternativesConsidered: [
			s2Alternatives.alternatives[0],
			{ ...s2Alternatives.alternatives[1], reasonRejected: 'Fails perf constraint on 10k todos.' },
		],
		chosenAlternative: 'a1',
		openQuestions: [],
	},
	citations: [{ id: 'c1', kind: 'analyze-bundle', ref: 'todos module' }],
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function walkToSynthesize(
	repo:     string,
	epicHash: string,
	s6:       Record<string, unknown>,
): Promise<string> {
	const startOut = payload(await handleWorkflowStep({
		phase:    'start',
		workflow: 'design.epic',
		focus:    'design HLD for tag filtering',
		repo,
		params:   { epicHash },
	}));
	assert.equal(startOut['next'], 'emit_plan', JSON.stringify(startOut));
	let state = startOut['state'] as string;

	const planOut = payload(await handleWorkflowStep({
		phase: 'plan',
		plan: {
			workflow: 'design.epic',
			steps: [
				{ id: 's1', runner: 'context.assemble',       params: {} },
				{ id: 's2', runner: 'alternatives.enumerate', params: {} },
				{ id: 's3', runner: 'alternatives.judge',     params: {} },
				{ id: 's4', runner: 'framework.write',        params: {} },
				{ id: 's5', runner: 'rollout.overview',       params: {} },
				{ id: 's6', runner: 'checklist.verify',       params: {} },
			],
		},
		state,
	}));
	assert.equal(planOut['next'], 'emit_step');
	state = planOut['state'] as string;

	const responses = [s1Context, s2Alternatives, s3Judgment, s4Framework, s5Rollout, s6];
	const stepIds = ['s1', 's2', 's3', 's4', 's5', 's6'];
	for (let i = 0; i < 6; i++) {
		const out = payload(await handleWorkflowStep({
			phase:    'step',
			stepId:   stepIds[i]!,
			response: responses[i]!,
			state,
		}));
		if (i < 5) {
			assert.equal(out['next'], 'emit_step', `stage ${i}: ${JSON.stringify(out)}`);
		} else {
			assert.equal(out['next'], 'emit_synthesize');
		}
		state = out['state'] as string;
	}
	return state;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

test('design.epic: happy path writes _hld.md under docs/designs/<slug>/', async () => {
	_clearWorkflowStateStoreForTests();
	registerWorkflowRunners();
	const repo = mkdtempSync(join(tmpdir(), 'insrc-hld-e2e-'));
	const slug = HASH;
	try {
		seedApprovedDefine(repo, slug);
		const state = await walkToSynthesize(repo, slug, s6PassedVerdict);
		const done = payload(await handleWorkflowStep({
			phase:    'synthesize',
			artifact: artifactJson,
			state,
		}));
		assert.equal(done['next'], 'done', JSON.stringify(done));
		const outPath = done['path'] as string;
		// Markdown is named by the epicSlug ('tag-filtering'); the
		// canonical JSON stays hash-named.
		assert.ok(outPath.endsWith(`/docs/designs/HLD-tag-filtering.md`), outPath);
		assert.ok(existsSync(outPath));
		const md = readFileSync(outPath, 'utf8');
		assert.ok(md.includes('## Framework summary'));
		assert.ok(md.includes('### sc1: TagFilterAPI'));
		assert.ok(md.includes('**CHOSEN**'));
	} finally {
		rmSync(repo, { recursive: true, force: true });
	}
});

test('design.epic: refuses to start without an approved Define', async () => {
	_clearWorkflowStateStoreForTests();
	registerWorkflowRunners();
	const repo = mkdtempSync(join(tmpdir(), 'insrc-hld-e2e-'));
	try {
		const startOut = payload(await handleWorkflowStep({
			phase:    'start',
			workflow: 'design.epic',
			focus:    'x',
			repo,
			params:   { epicHash: MISSING_HASH },
		}));
		// Start itself just prepares the decomposer prompt — the gate
		// fires when s1 runs. Walk to s1 execution:
		const state1 = startOut['state'] as string;
		const planOut = payload(await handleWorkflowStep({
			phase: 'plan',
			plan: {
				workflow: 'design.epic',
				steps: [
					{ id: 's1', runner: 'context.assemble',       params: {} },
					{ id: 's2', runner: 'alternatives.enumerate', params: {} },
					{ id: 's3', runner: 'alternatives.judge',     params: {} },
					{ id: 's4', runner: 'framework.write',        params: {} },
					{ id: 's5', runner: 'rollout.overview',       params: {} },
					{ id: 's6', runner: 'checklist.verify',       params: {} },
				],
			},
			state: state1,
		}));
		// The context.assemble runner calls requireApprovedEpic at
		// prompt-build time; a missing Define triggers the executor's
		// `runner threw` error path.
		assert.equal(planOut['next'], 'error', JSON.stringify(planOut));
	} finally {
		rmSync(repo, { recursive: true, force: true });
	}
});

test('design.epic: refuses without epicHash param', async () => {
	_clearWorkflowStateStoreForTests();
	registerWorkflowRunners();
	const repo = mkdtempSync(join(tmpdir(), 'insrc-hld-e2e-'));
	try {
		const errOut = payload(await handleWorkflowStep({
			phase:    'start',
			workflow: 'design.epic',
			focus:    'x',
			repo,
		}));
		assert.equal(errOut['next'], 'error');
	} finally {
		rmSync(repo, { recursive: true, force: true });
	}
});

test('design.epic: s6 sbdry1=missed forces synthesize hard-fail', async () => {
	_clearWorkflowStateStoreForTests();
	registerWorkflowRunners();
	const repo = mkdtempSync(join(tmpdir(), 'insrc-hld-e2e-'));
	const slug = HASH;
	try {
		seedApprovedDefine(repo, slug);
		const state = await walkToSynthesize(repo, slug, s6BoundaryFailVerdict);
		const errOut = payload(await handleWorkflowStep({
			phase:    'synthesize',
			artifact: artifactJson,
			state,
		}));
		assert.equal(errOut['next'], 'error');
		const err = errOut['error'] as { message: string };
		assert.match(err.message, /sbdry1/);
	} finally {
		rmSync(repo, { recursive: true, force: true });
	}
});

test('design.epic: refuses when a Story from Epic is missing from storyBoundaries', async () => {
	_clearWorkflowStateStoreForTests();
	registerWorkflowRunners();
	const repo = mkdtempSync(join(tmpdir(), 'insrc-hld-e2e-'));
	const slug = HASH;
	try {
		seedApprovedDefine(repo, slug);
		const state = await walkToSynthesize(repo, slug, s6PassedVerdict);
		const badArtifact = {
			...artifactJson,
			body: {
				...artifactJson.body,
				storyBoundaries: [artifactJson.body.storyBoundaries[0]!], // drop s2
			},
		};
		const errOut = payload(await handleWorkflowStep({
			phase:    'synthesize',
			artifact: badArtifact,
			state,
		}));
		assert.equal(errOut['next'], 'error');
		const err = errOut['error'] as { message: string };
		assert.match(err.message, /s2/);
	} finally {
		rmSync(repo, { recursive: true, force: true });
	}
});

test('design.epic: refuses when interfaceSketch contains a return', async () => {
	_clearWorkflowStateStoreForTests();
	registerWorkflowRunners();
	const repo = mkdtempSync(join(tmpdir(), 'insrc-hld-e2e-'));
	const slug = HASH;
	try {
		seedApprovedDefine(repo, slug);
		const state = await walkToSynthesize(repo, slug, s6PassedVerdict);
		const badArtifact = {
			...artifactJson,
			body: {
				...artifactJson.body,
				sharedContracts: [
					{
						...artifactJson.body.sharedContracts[0]!,
						interfaceSketch: 'function list(tag) { return db.filter(tag); }',
					},
				],
			},
		};
		const errOut = payload(await handleWorkflowStep({
			phase:    'synthesize',
			artifact: badArtifact,
			state,
		}));
		assert.equal(errOut['next'], 'error');
		const err = errOut['error'] as { message: string };
		assert.match(err.message, /InterfaceSketch/);
	} finally {
		rmSync(repo, { recursive: true, force: true });
	}
});
