/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * End-to-end tests for the cross-stage open-question gate in
 * `insrc_workflow_step` (design.story is the exemplar: its upstream is the
 * HLD).
 *
 *   - An HLD with an open question → design.story start returns
 *     resolve_questions (daemon-generated options), NOT emit_plan.
 *   - resolve_question with resolve / defer / ignore persists the right status
 *     to the HLD meta.
 *   - A deferred question surfaces in review_deferred and does NOT re-trigger
 *     the start gate.
 *   - A resolved / ignored question does not re-trigger; re-calling start
 *     proceeds to emit_plan.
 *   - The optional end-of-stage `openQuestions` is present in `done` when the
 *     just-produced artifact still carries open questions.
 *
 * The option-generating provider is stubbed. git/gh side effects are no-ops in
 * the tmp (non-git) repo.
 *
 * Run: npx tsx --test src/mcp/workflow-step/__tests__/questions-gate-e2e.test.ts
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { tmpdir } from 'node:os';

import { handleWorkflowStep } from '../handler.js';
import { registerWorkflowRunners } from '../../../workflow/index.js';
import { _clearWorkflowStateStoreForTests } from '../state-store.js';
import { approveArtifactByJsonPath } from '../../../workflow/gates.js';
import { _setQuestionProviderForTests } from '../../../workflow/questions.js';
import { defineArtifactPaths, hldArtifactPaths } from '../../../workflow/storage.js';
import type { LLMProvider } from '../../../shared/types.js';
import type { QuestionResolution as QR } from '../../../workflow/types.js';

const HASH = 'a3f4b8c9d1e2f3a4';

interface Envelope { readonly content: readonly { readonly type: 'text'; readonly text: string }[]; readonly isError?: boolean }
function payload(env: Envelope): Record<string, unknown> {
	const first = env.content[0];
	assert.ok(first !== undefined);
	return JSON.parse(first.text) as Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// Stub option provider
// ---------------------------------------------------------------------------

function stubProvider(): LLMProvider {
	return {
		capabilities: { structuredOutput: true, toolCalling: false, vision: false, webSearch: false, streaming: false, embeddings: false },
		async complete() { return { text: '', stopReason: 'end_turn' as const }; },
		async completeStructured<T>() {
			return { options: [{ label: 'Option A', detail: 'A way.' }, { label: 'Option B', detail: 'B way.' }], recommendation: 'Prefer Option A.' } as unknown as T;
		},
		stream() { return (async function* () { /* empty */ })(); },
		async embed() { return []; },
	} as unknown as LLMProvider;
}

// ---------------------------------------------------------------------------
// Fixture: approved Define + HLD (HLD open questions configurable)
// ---------------------------------------------------------------------------

function seed(repo: string, hldOpenQuestions: readonly string[]): void {
	const dp = defineArtifactPaths(repo, HASH);
	mkdirSync(dirname(dp.json), { recursive: true });
	writeFileSync(dp.json, JSON.stringify({
		meta: { workflow: 'define', runId: 'define-1', schemaVersion: 1, epicHash: HASH, epicSlug: 'tag-filtering' },
		body: {
			flavor: 'enhancement', problem: 'Users cannot filter todos by tag.',
			nonGoals: [], assumptions: [{ text: 'Todos have tags', confidence: 'high', source: 'c1' }],
			constraints: [{ id: 'k1', text: 'Reuse sidebar', type: 'convention', source: 'c1' }],
			stories: [
				{ id: 's1', title: 'Filter by tag', userValue: 'v', acceptanceCriteria: [{ id: 'ac1', given: 'x', when: 'y', then: 'z', operationalizes: ['k1'] }] },
				{ id: 's2', title: 'Clear filter',  userValue: 'v', acceptanceCriteria: [{ id: 'ac1', given: 'x', when: 'y', then: 'z', operationalizes: ['k1'] }] },
			],
			openQuestions: [],
		},
		citations: [{ id: 'c1', kind: 'analyze-bundle', ref: 'todos module' }],
	}, null, 2));
	approveArtifactByJsonPath(dp.json);

	const hp = hldArtifactPaths(repo, HASH);
	writeFileSync(hp.json, JSON.stringify({
		meta: { workflow: 'design.epic', runId: 'hld-run-1', schemaVersion: 1, epicHash: HASH, epicSlug: 'tag-filtering', tracker: { epicRef: 'acme/widgets#5' } },
		body: {
			frameworkSummary: 'Extract TagFilter service.',
			architectureShape: 'TagFilter owns the tag index [[c1]]; sidebar consumes it.',
			sharedContracts: [{ id: 'sc1', name: 'TagFilterAPI', purpose: 'Query todos by a single tag', interfaceSketch: 'interface TagFilterAPI { list(tag: string): Todo[] }', ownedByStory: 's1', consumedByStories: ['s2'], assumptions: ['c1'] }],
			storyBoundaries: [
				{ storyId: 's1', owns: ['sc1'], depends: [], internal: 'index storage private' },
				{ storyId: 's2', owns: [], depends: ['sc1'], internal: 'UI state private' },
			],
			nonFunctional: { performance: 'P50 < 20ms' },
			rolloutOverview: { phases: [{ name: 'Phase A', includesStories: ['s1'], rationale: 'contract first', backwardCompat: '', featureFlag: null }, { name: 'Phase B', includesStories: ['s2'], rationale: 'consumer next', backwardCompat: '', featureFlag: null }], orderingRationale: 's2 depends on sc1', riskyBits: [] },
			alternativesConsidered: [
				{ id: 'a1', name: 'Service', oneLineSummary: 'x', approach: 'own the index', pros: ['x'], cons: ['x'], costEstimate: 'S' },
				{ id: 'a2', name: 'Inline',  oneLineSummary: 'x', approach: 'sidebar scans', pros: ['x'], cons: ['x'], costEstimate: 'XS', reasonRejected: 'perf' },
			],
			chosenAlternative: 'a1',
			openQuestions: hldOpenQuestions,
		},
		citations: [{ id: 'c1', kind: 'analyze-bundle', ref: 'todos module' }],
	}, null, 2));
	approveArtifactByJsonPath(hp.json);
}

function readHldResolutions(repo: string): Record<string, QR> {
	const hld = JSON.parse(readFileSync(hldArtifactPaths(repo, HASH).json, 'utf8')) as { meta: { questionResolutions?: Record<string, QR> } };
	return hld.meta.questionResolutions ?? {};
}

async function startDesignStory(repo: string): Promise<Record<string, unknown>> {
	return payload(await handleWorkflowStep({
		phase: 'start', workflow: 'design.story', focus: 'LLD for s1', repo, params: { epicHash: HASH, storyId: 's1' },
	}));
}

function mkRepo(): string { return mkdtempSync(join(tmpdir(), 'insrc-oq-gate-')); }

// ---------------------------------------------------------------------------
// start gate + resolve_question (resolve / defer / ignore)
// ---------------------------------------------------------------------------

test('start gates on an unresolved HLD open question, returns resolve_questions with options', async () => {
	_clearWorkflowStateStoreForTests();
	registerWorkflowRunners();
	_setQuestionProviderForTests(stubProvider());
	const repo = mkRepo();
	try {
		seed(repo, ['[hq1 / missed] Should tags be case-insensitive?']);
		const out = await startDesignStory(repo);
		assert.equal(out['next'], 'resolve_questions', JSON.stringify(out));
		const qs = out['questions'] as { questionId: string; text: string; options: unknown[]; recommendation: string }[];
		assert.equal(qs.length, 1);
		assert.equal(qs[0]!.questionId, 'hq1');
		assert.equal(qs[0]!.options.length, 2);
		assert.match(qs[0]!.recommendation, /Option A/);
	} finally {
		_setQuestionProviderForTests(undefined);
		rmSync(repo, { recursive: true, force: true });
	}
});

test('resolve_question resolve → HLD meta resolved, then start proceeds to emit_plan', async () => {
	_clearWorkflowStateStoreForTests();
	registerWorkflowRunners();
	_setQuestionProviderForTests(stubProvider());
	const repo = mkRepo();
	try {
		seed(repo, ['[hq1 / missed] Case-insensitive tags?']);
		assert.equal((await startDesignStory(repo))['next'], 'resolve_questions');

		const done = payload(await handleWorkflowStep({
			phase: 'resolve_question', workflow: 'design.story', params: { epicHash: HASH, storyId: 's1' },
			questionId: 'hq1', choice: 'Case-insensitive', rationale: 'matches expectation', repo,
		}));
		assert.equal(done['next'], 'ready', JSON.stringify(done));
		assert.equal(readHldResolutions(repo)['hq1']!.status, 'resolved');
		assert.equal(readHldResolutions(repo)['hq1']!.choice, 'Case-insensitive');

		// Re-call start → no re-trigger; proceeds.
		assert.equal((await startDesignStory(repo))['next'], 'emit_plan');
	} finally {
		_setQuestionProviderForTests(undefined);
		rmSync(repo, { recursive: true, force: true });
	}
});

test('resolve_question ignore → HLD meta ignored, start proceeds', async () => {
	_clearWorkflowStateStoreForTests();
	registerWorkflowRunners();
	_setQuestionProviderForTests(stubProvider());
	const repo = mkRepo();
	try {
		seed(repo, ['[hq1 / missed] Add a metric?']);
		assert.equal((await startDesignStory(repo))['next'], 'resolve_questions');
		const done = payload(await handleWorkflowStep({
			phase: 'resolve_question', workflow: 'design.story', params: { epicHash: HASH, storyId: 's1' },
			questionId: 'hq1', ignore: true, repo,
		}));
		assert.equal(done['next'], 'ready');
		assert.equal(readHldResolutions(repo)['hq1']!.status, 'ignored');
		assert.equal((await startDesignStory(repo))['next'], 'emit_plan');
	} finally {
		_setQuestionProviderForTests(undefined);
		rmSync(repo, { recursive: true, force: true });
	}
});

test('resolve_question defer → deferred does NOT re-trigger start, shows in review_deferred', async () => {
	_clearWorkflowStateStoreForTests();
	registerWorkflowRunners();
	_setQuestionProviderForTests(stubProvider());
	const repo = mkRepo();
	try {
		seed(repo, ['[hq1 / missed] Rename the field?']);
		assert.equal((await startDesignStory(repo))['next'], 'resolve_questions');
		const done = payload(await handleWorkflowStep({
			phase: 'resolve_question', workflow: 'design.story', params: { epicHash: HASH, storyId: 's1' },
			questionId: 'hq1', defer: true, repo,
		}));
		assert.equal(done['next'], 'ready');
		assert.equal(readHldResolutions(repo)['hq1']!.status, 'deferred');

		// Deferred does NOT re-trigger the mandatory start gate.
		assert.equal((await startDesignStory(repo))['next'], 'emit_plan');

		// But it surfaces in review_deferred, with the exact resolve call.
		const review = payload(await handleWorkflowStep({ phase: 'review_deferred', params: { epicSlug: 'tag-filtering' }, repo }));
		assert.equal(review['next'], 'deferred', JSON.stringify(review));
		const qs = review['questions'] as { questionId: string; kind: string; resolveWith: { workflow: string; params: Record<string, unknown> } }[];
		assert.equal(qs.length, 1);
		assert.equal(qs[0]!.questionId, 'hq1');
		assert.equal(qs[0]!.kind, 'hld');
		assert.equal(qs[0]!.resolveWith.workflow, 'design.story');
		assert.equal(qs[0]!.resolveWith.params['epicHash'], HASH);
	} finally {
		_setQuestionProviderForTests(undefined);
		rmSync(repo, { recursive: true, force: true });
	}
});

test('start proceeds directly when the upstream HLD has no open questions', async () => {
	_clearWorkflowStateStoreForTests();
	registerWorkflowRunners();
	const repo = mkRepo();
	try {
		seed(repo, []);
		assert.equal((await startDesignStory(repo))['next'], 'emit_plan');
	} finally { rmSync(repo, { recursive: true, force: true }); }
});

// ---------------------------------------------------------------------------
// Stage 3 — optional end-of-stage openQuestions in `done`
// ---------------------------------------------------------------------------

test('synthesize `done` carries the new artifact\'s still-open questions', async () => {
	_clearWorkflowStateStoreForTests();
	registerWorkflowRunners();
	const repo = mkRepo();
	try {
		seed(repo, []);   // HLD clean → start proceeds
		const state = await walkLldToSynthesize(repo);
		const done = payload(await handleWorkflowStep({
			phase: 'synthesize', state,
			artifact: lldArtifact(['[oq1 / defer] A leftover LLD question?']),
		}));
		assert.equal(done['next'], 'done', JSON.stringify(done));
		const oq = done['openQuestions'] as { questionId: string; text: string }[] | undefined;
		assert.ok(oq !== undefined, 'expected openQuestions on done');
		assert.equal(oq!.length, 1);
		assert.equal(oq![0]!.questionId, 'oq1');
	} finally { rmSync(repo, { recursive: true, force: true }); }
});

test('synthesize `done` omits openQuestions when the artifact carries none', async () => {
	_clearWorkflowStateStoreForTests();
	registerWorkflowRunners();
	const repo = mkRepo();
	try {
		seed(repo, []);
		const state = await walkLldToSynthesize(repo);
		const done = payload(await handleWorkflowStep({ phase: 'synthesize', state, artifact: lldArtifact([]) }));
		assert.equal(done['next'], 'done');
		assert.equal(done['openQuestions'], undefined);
	} finally { rmSync(repo, { recursive: true, force: true }); }
});

// ---------------------------------------------------------------------------
// LLD walk scaffolding (mirrors design-story-e2e)
// ---------------------------------------------------------------------------

const hldSliceForS1 = {
	frameworkSummary: 'Extract TagFilter service.',
	ownedContracts: [{ id: 'sc1', name: 'TagFilterAPI', purpose: 'Query todos by a single tag', interfaceSketch: 'interface TagFilterAPI { list(tag: string): Todo[] }', ownedByStory: 's1', consumedByStories: ['s2'], assumptions: ['c1'] }],
	consumedContracts: [],
	boundary: { storyId: 's1', owns: ['sc1'], depends: [], internal: 'index storage private' },
	rolloutPhase: 'Phase A',
	nonFunctional: { performance: 'P50 < 20ms' },
};

function lldArtifact(openQuestions: readonly string[]): Record<string, unknown> {
	return {
		body: {
			hldContextSlice: hldSliceForS1,
			contractDetails: { surfaceLevel: 'internal-shared', api: [{ name: 'TagFilterAPI.list', signature: 'list(tag: string): Todo[]', parameters: [{ name: 'tag', type: 'string', purpose: 'the tag', optional: false }], returns: { type: 'Todo[]', meaning: 'todos tagged with tag' }, errors: [{ type: 'UnknownTagError', condition: 'tag not registered' }], preconditions: ['tag non-empty'], postconditions: ['sorted desc'] }] },
			dataModelChanges: [{ entity: 'Todo', change: 'invariant-change', details: 'add tag index invariant', callSites: ['src/todos/store.ts:filter'] }],
			interactionWithShared: [{ contractId: 'sc1', role: 'implements', howDetails: 's1 owns TagFilterAPI' }],
			errorPaths: { errorCases: [{ scenario: 'unknown tag', detection: 'lookup miss', response: 'throw', userImpact: 'empty', recoverable: true }], edgeCases: [{ input: 'empty tag', expected: 'empty array' }], invariantsToPreserve: [{ text: 'status filter still works', source: 'c1' }] },
			testStrategy: { testLevels: [{ level: 'unit', purpose: 'list()', subjects: ['TagFilterAPI.list'] }], acceptanceMapping: [{ criterionId: 'ac1', provingTests: ['unit:TagFilterAPI.list'] }], testFramework: 'node:test' },
			migration: { stateBefore: 'status only', stateAfter: 'status + tag', migrationSteps: [{ order: 1, action: 'add tag index', rollbackable: true }], backwardCompat: 'unchanged', zeroDowntime: true, dataRewriteRequired: false },
			alternativesConsidered: [{ id: 'a1', name: 'In-memory', oneLineSummary: 'x', approach: 'warm map', pros: ['fast'], cons: ['mem'], costEstimate: 'S' }],
			chosenAlternative: 'a1',
			openQuestions,
		},
		citations: [{ id: 'c1', kind: 'analyze-bundle', ref: 'todos module' }],
	};
}

async function walkLldToSynthesize(repo: string): Promise<string> {
	const startOut = await startDesignStory(repo);
	assert.equal(startOut['next'], 'emit_plan', JSON.stringify(startOut));
	let state = startOut['state'] as string;
	const planOut = payload(await handleWorkflowStep({
		phase: 'plan', state,
		plan: { workflow: 'design.story', steps: [
			{ id: 's1', runner: 'context.assemble', params: {} },
			{ id: 's2', runner: 'alternatives.enumerate', params: {} },
			{ id: 's3', runner: 'alternatives.judge', params: {} },
			{ id: 's4', runner: 'contract.detail', params: {} },
			{ id: 's5', runner: 'error.paths', params: {} },
			{ id: 's6', runner: 'test.strategy', params: {} },
			{ id: 's7', runner: 'migration.write', params: {} },
			{ id: 's8', runner: 'checklist.verify', params: {} },
		] },
	}));
	assert.equal(planOut['next'], 'emit_step', JSON.stringify(planOut));
	state = planOut['state'] as string;
	const steps: Array<{ id: string; response: Record<string, unknown> }> = [
		{ id: 's1', response: { analyzeBundles: [{ kind: 'symbol.locate', focus: 'TagFilterAPI', summary: 'new symbol', pathsCited: ['src/todos/filter.ts'] }] } },
		{ id: 's2', response: { alternatives: [
			{ id: 'a1', name: 'In-memory', oneLineSummary: 'x', approach: 'warm map', pros: ['fast'], cons: ['mem'], costEstimate: 'S' },
			{ id: 'a2', name: 'DB view', oneLineSummary: 'x', approach: 'materialised view', pros: ['fresh'], cons: ['coupling'], costEstimate: 'M' },
		] } },
		{ id: 's3', response: { judgments: [
			{ alternativeId: 'a1', constraintScore: [{ constraintId: 'ac1', verdict: 'satisfies' }, { constraintId: 'sc1', verdict: 'satisfies' }], winnerRank: 1, rationale: 'both' },
			{ alternativeId: 'a2', constraintScore: [{ constraintId: 'ac1', verdict: 'partial' }, { constraintId: 'sc1', verdict: 'satisfies' }], winnerRank: 2, rationale: 'partial' },
		], winnerId: 'a1', winnerRationale: 'a1 fully.' } },
		{ id: 's4', response: { surfaceLevel: 'internal-shared', api: lldArtifact([]).body && (lldArtifact([]).body as { contractDetails: { api: unknown[] } }).contractDetails.api, dataModel: [{ entity: 'Todo', change: 'invariant-change', details: 'add tag index invariant', callSites: ['src/todos/store.ts:filter'] }], interactionWithShared: [{ contractId: 'sc1', role: 'implements', howDetails: 's1 owns TagFilterAPI' }] } },
		{ id: 's5', response: { errorCases: [{ scenario: 'unknown tag', detection: 'lookup miss', response: 'throw', userImpact: 'empty', recoverable: true }], edgeCases: [{ input: 'empty tag', expected: 'empty array' }], invariantsToPreserve: [{ text: 'status filter still works', source: 'c1' }] } },
		{ id: 's6', response: { testLevels: [{ level: 'unit', purpose: 'list()', subjects: ['TagFilterAPI.list'] }], acceptanceMapping: [{ criterionId: 'ac1', provingTests: ['unit:TagFilterAPI.list'] }], testFramework: 'node:test' } },
		{ id: 's7', response: { stateBefore: 'status only', stateAfter: 'status + tag', migrationSteps: [{ order: 1, action: 'add tag index', rollbackable: true }], backwardCompat: 'unchanged', zeroDowntime: true, dataRewriteRequired: false } },
		{ id: 's8', response: { results: [{ itemId: 'sbdry1', verdict: 'passed', evidence: 's4' }] } },
	];
	for (const step of steps) {
		const out = payload(await handleWorkflowStep({ phase: 'step', stepId: step.id, response: step.response, state }));
		if (step.id === 's8') assert.equal(out['next'], 'emit_synthesize', JSON.stringify(out));
		else assert.equal(out['next'], 'emit_step', `at ${step.id}: ${JSON.stringify(out)}`);
		state = out['state'] as string;
	}
	return state;
}
