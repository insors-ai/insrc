/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * End-to-end amendments walk.
 *
 * 1. Seed approved Define + approved HLD.
 * 2. Run LLD for s1 where s4 emits an amendment proposal.
 * 3. Verify the AmendmentRecord landed on disk with status='pending'
 *    and the LLD synthesized (proposal doesn't break finalize).
 * 4. Approve the amendment via the store API.
 * 5. Run scanLldStaleness — the s1 LLD is now stale
 *    (amendment-<id>).
 * 6. Ack-stale on the LLD via the gate helper — meta.staleAckedAt
 *    lands.
 *
 * Also: proposal that would fail applier is refused at finalize.
 *
 * Run:
 *   npx tsx --test src/insrc/mcp/workflow-step/__tests__/amendments-e2e.test.ts
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { defineArtifactPaths, hldArtifactPaths } from '../../../workflow/storage.js';

const HASH = 'a3f4b8c9d1e2f3a4';

import { handleWorkflowStep } from '../handler.js';
import { registerWorkflowRunners } from '../../../workflow/index.js';
import { _clearWorkflowStateStoreForTests } from '../state-store.js';
import {
	ackStaleArtifact,
	approveArtifactByJsonPath,
	jsonPathForMd,
	readBaseHld,
} from '../../../workflow/gates.js';
import {
	approveAmendment,
	listAmendments,
} from '../../../workflow/amendments/store.js';
import { scanLldStaleness } from '../../../workflow/amendments/staleness.js';

interface Envelope { readonly content: readonly { readonly type: 'text'; readonly text: string }[]; readonly isError?: boolean }
function payload(env: Envelope): Record<string, unknown> {
	const first = env.content[0];
	assert.ok(first !== undefined);
	return JSON.parse(first.text) as Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// Seed
// ---------------------------------------------------------------------------

function seed(repo: string, epicHash: string): void {
	const definePaths = defineArtifactPaths(repo, epicHash);
	mkdirSync(dirname(definePaths.json), { recursive: true });
	const defPath = definePaths.json;
	writeFileSync(defPath, JSON.stringify({
		meta: { workflow: 'define', runId: 'def-1', schemaVersion: 1, epicHash, epicSlug: 'tag-filtering' },
		body: {
			flavor: 'enhancement',
			problem: 'Users cannot filter todos by tag.',
			nonGoals: [], assumptions: [{ text: 'has tags', confidence: 'high', source: 'c1' }],
			constraints: [{ id: 'k1', text: 'sidebar reuse', type: 'convention', source: 'c1' }],
			stories: [
				{ id: 's1', title: 'Filter by tag', userValue: 'v',
				  acceptanceCriteria: [{ id: 'ac1', given: 'x', when: 'y', then: 'z', operationalizes: ['k1'] }] },
				{ id: 's2', title: 'Clear filter',  userValue: 'v',
				  acceptanceCriteria: [{ id: 'ac1', given: 'x', when: 'y', then: 'z', operationalizes: ['k1'] }] },
			],
			openQuestions: [],
		},
		citations: [{ id: 'c1', kind: 'analyze-bundle', ref: 'todos module' }],
	}, null, 2));
	approveArtifactByJsonPath(defPath);

	const hldPaths = hldArtifactPaths(repo, epicHash);
	mkdirSync(dirname(hldPaths.json), { recursive: true });
	const hldPath = hldPaths.json;
	writeFileSync(hldPath, JSON.stringify({
		meta: { workflow: 'design.epic', runId: 'hld-1', schemaVersion: 1, epicHash, epicSlug: 'tag-filtering' },
		body: {
			frameworkSummary: 'Extract TagFilter service.',
			architectureShape: 'TagFilter owns index [[c1]]; sidebar consumes.',
			sharedContracts: [{
				id: 'sc1', name: 'TagFilterAPI', purpose: 'query',
				interfaceSketch: 'interface TagFilterAPI { list(tag: string): Todo[]; }',
				ownedByStory: 's1', consumedByStories: ['s2'], assumptions: ['c1'],
			}],
			storyBoundaries: [
				{ storyId: 's1', owns: ['sc1'], depends: [],      internal: 'x' },
				{ storyId: 's2', owns: [],      depends: ['sc1'], internal: 'x' },
			],
			nonFunctional: { performance: 'P50 < 20ms' },
			rolloutOverview: {
				phases: [
					{ name: 'A', includesStories: ['s1'], rationale: 'x', backwardCompat: '', featureFlag: null },
					{ name: 'B', includesStories: ['s2'], rationale: 'x', backwardCompat: '', featureFlag: null },
				],
				orderingRationale: 'x', riskyBits: [],
			},
			alternativesConsidered: [
				{ id: 'a1', name: 'Service', oneLineSummary: 'x', approach: 'x', pros: ['x'], cons: ['x'], costEstimate: 'S' },
				{ id: 'a2', name: 'Inline',  oneLineSummary: 'x', approach: 'x', pros: ['x'], cons: ['x'], costEstimate: 'XS', reasonRejected: 'perf' },
			],
			chosenAlternative: 'a1', openQuestions: [],
		},
		citations: [{ id: 'c1', kind: 'analyze-bundle', ref: 'todos module' }],
	}, null, 2));
	approveArtifactByJsonPath(hldPath);
}

// ---------------------------------------------------------------------------
// LLM responses
// ---------------------------------------------------------------------------

const S1 = { analyzeBundles: [{ kind: 'symbol.locate', focus: 'TagFilterAPI', summary: 'not yet implemented', pathsCited: ['src/todos/filter.ts'] }] };
const S2 = { alternatives: [
	{ id: 'a1', name: 'In-memory', oneLineSummary: 'x', approach: 'a in-memory index sits warm', pros: ['fast'], cons: ['ram'], costEstimate: 'S' },
	{ id: 'a2', name: 'DB view',   oneLineSummary: 'x', approach: 'materialised view refreshed on write', pros: ['fresh'], cons: ['DB coupling'], costEstimate: 'M' },
] };
const S3 = { judgments: [
	{ alternativeId: 'a1', constraintScore: [{ constraintId: 'ac1', verdict: 'satisfies' }], winnerRank: 1, rationale: 'good' },
	{ alternativeId: 'a2', constraintScore: [{ constraintId: 'ac1', verdict: 'partial' }],  winnerRank: 2, rationale: 'partial' },
], winnerId: 'a1', winnerRationale: 'a1 wins' };
const S4_WITH_PROPOSAL = {
	surfaceLevel: 'internal-shared',
	api: [{
		name: 'TagFilterAPI.list',
		signature: 'list(tag: string): Todo[]',
		parameters: [{ name: 'tag', type: 'string', purpose: 'the tag', optional: false }],
		returns: { type: 'Todo[]', meaning: 'matching todos' },
		errors: [{ type: 'UnknownTagError', condition: 'tag not registered' }],
		preconditions: ['non-empty tag'], postconditions: ['sorted desc'],
	}],
	dataModel: [{ entity: 'Todo', change: 'invariant-change', details: 'index invariant', callSites: ['src/todos/store.ts:filter'] }],
	interactionWithShared: [{ contractId: 'sc1', role: 'implements', howDetails: 'owns' }],
	hld: {
		amendmentProposal: {
			amendment: {
				type: 'sharedContract.fieldAdd',
				contractId: 'sc1',
				field: { name: 'sortBy', type: 'string', optional: true, purpose: 'sort order' },
				breaking: false,
			},
			rationale: 'Story needs to control sort order to match sidebar convention.',
			citations: [{ id: 'c1', kind: 'analyze-bundle', ref: 'todos module' }],
		},
	},
};
const S4_BAD_PROPOSAL = {
	...S4_WITH_PROPOSAL,
	hld: {
		amendmentProposal: {
			amendment: {
				type: 'sharedContract.fieldAdd',
				contractId: 'sc1',
				field: { name: 'list', type: 'string', optional: false, purpose: 'x' },  // duplicate of existing method name
				breaking: false,
			},
			rationale: 'bad — duplicate field',
			citations: [],
		},
	},
};
const S5 = {
	errorCases: [{ scenario: 'unknown tag', detection: 'lookup miss', response: 'throw', userImpact: 'empty', recoverable: true }],
	edgeCases:  [{ input: 'empty tag',      expected: 'empty array' }],
	invariantsToPreserve: [{ text: 'status filter still works', source: 'c1' }],
};
const S6 = {
	testLevels: [{ level: 'unit', purpose: 'x', subjects: ['TagFilterAPI.list'] }],
	acceptanceMapping: [{ criterionId: 'ac1', provingTests: ['unit:list'] }],
	testFramework: 'node:test',
};
const S7 = {
	stateBefore: 'no tag filter', stateAfter: 'tag filter available',
	migrationSteps: [{ order: 1, action: 'add index', rollbackable: true }],
	backwardCompat: 'status filter intact', zeroDowntime: true, dataRewriteRequired: false,
};
const S8 = { results: [
	{ itemId: 'sbdry1', verdict: 'passed', evidence: 's4' },
	{ itemId: 'sbdry2', verdict: 'passed', evidence: 's4' },
	{ itemId: 'sbdry3', verdict: 'passed', evidence: 's4' },
	{ itemId: 'sbdry4', verdict: 'passed', evidence: 's4' },
] };

function hldSliceForS1() {
	return {
		frameworkSummary: 'Extract TagFilter service.',
		ownedContracts: [{
			id: 'sc1', name: 'TagFilterAPI', purpose: 'query',
			interfaceSketch: 'interface TagFilterAPI { list(tag: string): Todo[]; }',
			ownedByStory: 's1', consumedByStories: ['s2'], assumptions: ['c1'],
		}],
		consumedContracts: [],
		boundary: { storyId: 's1', owns: ['sc1'], depends: [], internal: 'x' },
		rolloutPhase: 'A',
		nonFunctional: { performance: 'P50 < 20ms' },
	};
}

function makeArtifact(): Record<string, unknown> {
	return {
		body: {
			hldContextSlice: hldSliceForS1(),
			contractDetails: { surfaceLevel: S4_WITH_PROPOSAL.surfaceLevel, api: S4_WITH_PROPOSAL.api },
			dataModelChanges: S4_WITH_PROPOSAL.dataModel,
			interactionWithShared: S4_WITH_PROPOSAL.interactionWithShared,
			errorPaths: S5, testStrategy: S6, migration: S7,
			alternativesConsidered: [ S2.alternatives[0], { ...S2.alternatives[1], reasonRejected: 'partial' } ],
			chosenAlternative: 'a1', openQuestions: [],
		},
		citations: [{ id: 'c1', kind: 'analyze-bundle', ref: 'todos module' }],
	};
}

async function walkLld(repo: string, slug: string, storyId: string, s4Response: Record<string, unknown>): Promise<string> {
	const startOut = payload(await handleWorkflowStep({
		phase: 'start', workflow: 'design.story', focus: `LLD for ${storyId}`, repo,
		params: { epicHash: slug, storyId },
	}));
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
	state = planOut['state'] as string;
	const responses: Record<string, unknown>[] = [S1, S2, S3, s4Response, S5, S6, S7, S8];
	const ids = ['s1', 's2', 's3', 's4', 's5', 's6', 's7', 's8'];
	for (let i = 0; i < 8; i++) {
		const out = payload(await handleWorkflowStep({
			phase: 'step', stepId: ids[i]!, response: responses[i]!, state,
		}));
		if (i < 7) assert.equal(out['next'], 'emit_step', `at s${i + 1}`);
		else       assert.equal(out['next'], 'emit_synthesize');
		state = out['state'] as string;
	}
	return state;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

test('LLD s4 amendment proposal lands as pending AmendmentRecord', async () => {
	_clearWorkflowStateStoreForTests();
	registerWorkflowRunners();
	const repo = mkdtempSync(join(tmpdir(), 'insrc-amend-e2e-'));
	const slug = HASH;
	try {
		seed(repo, slug);
		const state = await walkLld(repo, slug, 's1', S4_WITH_PROPOSAL);
		const done = payload(await handleWorkflowStep({
			phase: 'synthesize', artifact: makeArtifact(), state,
		}));
		assert.equal(done['next'], 'done', JSON.stringify(done));

		const amendments = listAmendments(repo, slug);
		assert.equal(amendments.length, 1);
		const a = amendments[0]!;
		assert.equal(a.status, 'pending');
		assert.equal(a.amendment.type, 'sharedContract.fieldAdd');
		assert.equal(a.proposedBy.stepId, 's4');
		assert.equal(a.proposedBy.storyId, 's1');
	} finally { rmSync(repo, { recursive: true, force: true }); }
});

test('Bad amendment proposal is dropped; the LLD still synthesizes', async () => {
	// An amendment proposal is OPTIONAL back-flow. A malformed one that the
	// applier would reject must NOT fail the otherwise-valid (expensive) LLD —
	// it is dropped with a warning and the LLD is written, with no record.
	_clearWorkflowStateStoreForTests();
	registerWorkflowRunners();
	const repo = mkdtempSync(join(tmpdir(), 'insrc-amend-e2e-'));
	const slug = HASH;
	try {
		seed(repo, slug);
		const state = await walkLld(repo, slug, 's1', S4_BAD_PROPOSAL);
		const out = payload(await handleWorkflowStep({
			phase: 'synthesize', artifact: makeArtifact(), state,
		}));
		assert.equal(out['next'], 'done');
		assert.ok(existsSync(out['path'] as string));
		// AND the invalid proposal was dropped, not persisted:
		const amendments = listAmendments(repo, slug);
		assert.equal(amendments.length, 0);
	} finally { rmSync(repo, { recursive: true, force: true }); }
});

test('Approving amendment marks existing LLD stale via effective-hash mismatch', async () => {
	_clearWorkflowStateStoreForTests();
	registerWorkflowRunners();
	const repo = mkdtempSync(join(tmpdir(), 'insrc-amend-e2e-'));
	const slug = HASH;
	try {
		seed(repo, slug);
		const state = await walkLld(repo, slug, 's1', S4_WITH_PROPOSAL);
		const done = payload(await handleWorkflowStep({
			phase: 'synthesize', artifact: makeArtifact(), state,
		}));
		const lldPath = done['path'] as string;
		assert.ok(existsSync(lldPath));

		const amendments = listAmendments(repo, slug);
		const pending = amendments[0]!;
		approveAmendment(repo, pending.id, 'human');

		// The s1 LLD was written before amendment approval; its
		// hldEffectiveHash reflects pre-approval state. After approval,
		// the current effective hash differs.
		const base = readBaseHld(repo, slug);
		const rows = scanLldStaleness(repo, slug, base);
		const s1 = rows.find(r => r.storyId === 's1')!;
		assert.equal(s1.stale, true);
		assert.equal(s1.staleReason, `amendment-${pending.id}`);
	} finally { rmSync(repo, { recursive: true, force: true }); }
});

test('ack-stale writes staleAckedAt onto LLD meta', async () => {
	_clearWorkflowStateStoreForTests();
	registerWorkflowRunners();
	const repo = mkdtempSync(join(tmpdir(), 'insrc-amend-e2e-'));
	const slug = HASH;
	try {
		seed(repo, slug);
		const state = await walkLld(repo, slug, 's1', S4_WITH_PROPOSAL);
		const done = payload(await handleWorkflowStep({
			phase: 'synthesize', artifact: makeArtifact(), state,
		}));
		const lldPath = jsonPathForMd(done['path'] as string);
		const before = JSON.parse(readFileSync(lldPath, 'utf8'));
		assert.equal(before.meta.staleAckedAt, undefined);
		const r = ackStaleArtifact(lldPath, 'known-inconsistency; scheduled to re-run');
		assert.match(r.ackedAt, /^\d{4}-\d{2}-\d{2}T/);
		const after = JSON.parse(readFileSync(lldPath, 'utf8'));
		assert.equal(after.meta.staleAckedReason, 'known-inconsistency; scheduled to re-run');
	} finally { rmSync(repo, { recursive: true, force: true }); }
});
