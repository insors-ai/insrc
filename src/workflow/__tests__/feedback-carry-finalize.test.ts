/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * A document's saved comments survive its re-authoring where they are: they are Feedback lines stored beside the head, so a
 * re-authored HLD, epic LLD, standalone LLD or PLAN needs no carrying. The finalizer writes no feedback into the new body, the
 * new document has no Feedback section, the lines are still there afterwards, and the prior JSON is only read. Each case drives
 * the real finalizer (finalizeArtifact) over a head a real earlier finalize produced and the FeedbackService added comments to.
 *
 * Run: npx tsx --test --test-force-exit src/workflow/__tests__/feedback-carry-finalize.test.ts
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

import { finalizeArtifact } from '../orchestrator.js';
import {
	artifactJsonPath, defineArtifactId, defineArtifactPaths, hldArtifactId, hldArtifactPaths,
	lldArtifactId, planArtifactId,
} from '../storage.js';
import { lifecycleFor, resetLifecycleRegistry } from '../../daemon/lifecycle-registry.js';
import type { WorkflowIntent } from '../types.js';
import { approvedMeta, draftMeta, markApprovedSync } from './lifecycle-fixtures.js';

const HASH    = 'f1e2d3c4b5a69788';
const CREATED = '2026-07-17T07:42:28.275Z';

const FIRST_COMMENT  = 'Say what the header shows.';
const SECOND_COMMENT = 'The second phase needs an owner.';

interface Finalized {
	readonly artifact: { readonly meta: Record<string, unknown>; readonly body: Record<string, unknown> };
	readonly renderedMd: string;
	readonly renderedJson: string;
}

async function finalize(intent: WorkflowIntent, emit: Record<string, unknown>, runId: string): Promise<Finalized> {
	const result = await finalizeArtifact(intent, {}, runId, 5, emit, 'client');
	assert.equal(result.ok, true, `finalize[${intent.workflow}] failed: ${JSON.stringify((result as { failure?: unknown }).failure)}`);
	if (!result.ok) throw new Error('unreachable');
	return result.finalized as unknown as Finalized;
}

function intent(workflow: string, repo: string, params: Record<string, unknown>): WorkflowIntent {
	return { workflow, focus: 'keep the comments of a re-authored document', repoPath: repo, repoIndexedAt: null, params } as unknown as WorkflowIntent;
}

function lldBody(storyId: string): Record<string, unknown> {
	return {
		hldContextSlice: { frameworkSummary: 'x', ownedContracts: [], consumedContracts: [], boundary: { storyId, owns: [], depends: [], internal: 'x' }, adjacentBoundaries: [], rolloutPhase: 'P', nonFunctional: {} },
		contractDetails: { surfaceLevel: 'internal', api: [] },
		dataModelChanges: [],
		interactionWithShared: [],
		errorPaths: { errorCases: [], edgeCases: [], invariantsToPreserve: [] },
		testStrategy: { testLevels: [], acceptanceMapping: [], testFramework: 'node:test' },
		alternativesConsidered: [{ id: 'a1', name: 'n', oneLineSummary: 'x', approach: 'x', pros: ['x'], cons: ['x'], costEstimate: 'S' }],
		chosenAlternative: 'a1',
		openQuestions: [],
	};
}

function hldBody(): Record<string, unknown> {
	return {
		frameworkSummary: 'The framework', architectureShape: 'The shape [[c1]]',
		sharedContracts: [],
		storyBoundaries: [{ storyId: 's1', owns: [], depends: [], internal: 's1 internals' }],
		nonFunctional: {},
		rolloutOverview: { phases: [{ name: 'P', includesStories: ['s1'], rationale: 'r', backwardCompat: '', featureFlag: null }], orderingRationale: 'o', riskyBits: [] },
		alternativesConsidered: [
			{ id: 'a1', name: 'chosen', oneLineSummary: 'x', approach: 'x', pros: ['x'], cons: ['x'], costEstimate: 'S' },
			{ id: 'a2', name: 'other', oneLineSummary: 'x', approach: 'x', pros: ['x'], cons: ['x'], costEstimate: 'S', reasonRejected: 'r' },
		],
		chosenAlternative: 'a1',
		openQuestions: [],
	};
}

function planBody(): Record<string, unknown> {
	return {
		tasks: [{
			id: 't1', title: 'A task', summary: 'Does the thing.', size: 'S', order: 1,
			dependsOn: [], acceptanceChecks: ['it holds'], derivedFrom: ['c1'],
			tests: [{ level: 'unit', name: 'unit: t1 works' }],
		}],
		testStrategyCoverage: [],
	};
}

function defineEmit(): Record<string, unknown> {
	return {
		body: {
			flavor: 'enhancement', problem: 'Comments are lost when a document is written again.',
			nonGoals: [], assumptions: [], constraints: [],
			stories: [{
				id: 's1', title: 'Keep the comments', userValue: 'history stays',
				acceptanceCriteria: [{ id: 'ac1', given: 'a comment', when: 'the document is re-authored', then: 'it is kept', operationalizes: [] }],
			}],
			openQuestions: [],
		},
		citations: [{ id: 'c1', kind: 'step-output', ref: 's2' }],
	};
}

/** A one-Story approved Epic, the upstream an HLD needs. */
function seedEpic(repo: string): void {
	const dp = defineArtifactPaths(repo, HASH, CREATED, 'epic', 'carry-epic');
	mkdirSync(dirname(dp.json), { recursive: true });
	writeFileSync(dp.json, JSON.stringify({
		meta: { workflow: 'define', runId: 'def-carry', schemaVersion: 1, epicHash: HASH, epicSlug: 'carry-epic', createdAt: CREATED, epicCreatedAt: CREATED },
		body: {
			flavor: 'new-capability', problem: 'x', nonGoals: [], assumptions: [], constraints: [],
			stories: [{ id: 's1', title: 'The story', userValue: 'v', acceptanceCriteria: [], dependsOn: [] }],
			openQuestions: [],
		},
		citations: [],
	}, null, 2));
	markApprovedSync(dp.json);
}

/** An approved HLD for the seeded Epic, the upstream an epic Story's LLD needs. */
function seedHld(repo: string): void {
	const hp = hldArtifactPaths(repo, HASH, CREATED, 'epic', 'carry-epic');
	writeFileSync(hp.json, JSON.stringify({
		meta: { workflow: 'design.epic', runId: 'hld-carry', schemaVersion: 1, epicHash: HASH, epicSlug: 'carry-epic', createdAt: CREATED, epicCreatedAt: CREATED },
		body: hldBody(),
		citations: [{ id: 'c1', kind: 'analyze-bundle', ref: 'x' }],
	}, null, 2));
	markApprovedSync(hp.json);
}

/** An approved standalone LLD, the upstream a PLAN needs. */
function seedStandaloneLld(repo: string): void {
	mkdirSync(join(repo, '.insrc', 'artifacts'), { recursive: true });
	writeFileSync(artifactJsonPath(repo, lldArtifactId(HASH, 's1')), JSON.stringify({
		meta: {
			workflow: 'design.story', epicHash: HASH, storyId: 's1', epicSlug: 'carry-item', standalone: true,
			createdAt: CREATED, epicCreatedAt: CREATED, ...approvedMeta({ at: '2026-07-17T09:00:00.000Z' }), runId: 'wf-seed-lld',
		},
		body: lldBody('s1'),
	}));
}

interface CarryCase {
	readonly name: string;
	readonly artifactId: string;
	readonly intent: (repo: string) => WorkflowIntent;
	readonly emit: () => Record<string, unknown>;
	readonly seed: (repo: string) => void;
}

const CODE_CITE = [{ id: 'c1', kind: 'code', ref: 'src/x.ts' }];
const BUNDLE_CITE = [{ id: 'c1', kind: 'analyze-bundle', ref: 'x' }];

const CASES: readonly CarryCase[] = [
	{
		name: 'HLD', artifactId: hldArtifactId(HASH),
		intent: repo => intent('design.epic', repo, { epicHash: HASH }),
		emit: () => ({ body: hldBody(), citations: BUNDLE_CITE }),
		seed: seedEpic,
	},
	{
		name: 'epic LLD', artifactId: lldArtifactId(HASH, 's1'),
		intent: repo => intent('design.story', repo, { epicHash: HASH, storyId: 's1' }),
		emit: () => ({ body: lldBody('s1'), citations: BUNDLE_CITE }),
		seed: repo => { seedEpic(repo); seedHld(repo); },
	},
	{
		name: 'standalone LLD', artifactId: lldArtifactId(HASH, 's1'),
		intent: repo => intent('design.story', repo, { standalone: true, epicHash: HASH, storyId: 's1', sizeClass: 'small' }),
		emit: () => ({ body: lldBody('s1'), citations: CODE_CITE }),
		seed: repo => { mkdirSync(join(repo, '.insrc', 'artifacts'), { recursive: true }); },
	},
	{
		name: 'PLAN', artifactId: planArtifactId(HASH, 's1'),
		intent: repo => intent('plan', repo, { standalone: true, epicHash: HASH, storyId: 's1' }),
		emit: () => ({ body: planBody(), citations: CODE_CITE }),
		seed: seedStandaloneLld,
	},
];

/** Store the first authoring where the workflow writes it, as a head, and save two comments on it through the FeedbackService. */
async function storeWithComments(repo: string, artifactId: string, first: Finalized, mdRel: string): Promise<string[]> {
	const jsonPath = artifactJsonPath(repo, artifactId);
	const head = JSON.parse(first.renderedJson) as { meta: Record<string, unknown> };
	writeFileSync(jsonPath, JSON.stringify({ ...head, meta: { ...head.meta, epicCreatedAt: CREATED, ...draftMeta() } }, null, 2) + '\n');
	const service = lifecycleFor(repo).feedback;
	const actor = { id: 'github:rev', kind: 'person' as const, properties: {} };
	await service.add(artifactId, { text: FIRST_COMMENT, kind: 'revision-request', batchId: 'b1', anchor: { quote: 'cut to 8 lines', section: mdRel } }, actor);
	await service.add(artifactId, { text: SECOND_COMMENT, kind: 'revision-request', batchId: 'b1' }, actor);
	const stored = (await service.entries(artifactId)).map(f => f.text);
	assert.equal(stored.length, 2, 'fixture: two comments are stored');
	return stored;
}

test('finalize: a re-authored HLD, epic LLD, standalone LLD and PLAN carry no feedback in the body or the document, and the comments saved on them are still stored beside the head', async () => {
	for (const c of CASES) {
		const repo = mkdtempSync(join(tmpdir(), 'insrc-carry-'));
		try {
			c.seed(repo);

			const first = await finalize(c.intent(repo), c.emit(), `wf-first-${c.name}`);
			assert.equal(first.artifact.body['feedback'], undefined, `${c.name}: a first authoring has no feedback`);
			assert.doesNotMatch(first.renderedMd, /^#+ .*Feedback/m, `${c.name}: a first authoring has no Feedback section`);

			const stored = await storeWithComments(repo, c.artifactId, first, `docs/${c.name}.md`);

			const again = await finalize(c.intent(repo), c.emit(), `wf-again-${c.name}`);
			assert.equal(again.artifact.body['feedback'], undefined, `${c.name}: the re-authored body holds none`);
			assert.equal('feedback' in (JSON.parse(again.renderedJson) as { body: object }).body, false, `${c.name}: nor does its JSON`);
			assert.notEqual(again.artifact.meta['runId'], first.artifact.meta['runId'], `${c.name}: it is a new authoring`);
			assert.doesNotMatch(again.renderedMd, /^#+ .*Feedback/m, `${c.name}: and the document has no Feedback section`);
			assert.ok(!again.renderedMd.includes(FIRST_COMMENT) && !again.renderedMd.includes(SECOND_COMMENT), `${c.name}: the comments are not copied into the document`);
			assert.deepEqual((await lifecycleFor(repo).feedback.entries(c.artifactId)).map(f => f.text), stored, `${c.name}: the comments are still stored, in order`);
		} finally { resetLifecycleRegistry(); rmSync(repo, { recursive: true, force: true }); }
	}

	// a re-authored Define is a new work item: it has no comments of the old one
	const repo = mkdtempSync(join(tmpdir(), 'insrc-carry-def-'));
	try {
		mkdirSync(join(repo, '.insrc', 'artifacts'), { recursive: true });
		const first = await finalize(intent('define', repo, {}), defineEmit(), 'wf-first-def');
		await storeWithComments(repo, defineArtifactId(String(first.artifact.meta['epicHash'])), first, 'docs/DEFINE.md');
		const again = await finalize(intent('define', repo, {}), defineEmit(), 'wf-again-def');
		assert.equal(again.artifact.body['feedback'], undefined, 'a re-authored Define carries no feedback');
		assert.ok(!again.renderedMd.includes(FIRST_COMMENT), 'and renders none');
	} finally { resetLifecycleRegistry(); rmSync(repo, { recursive: true, force: true }); }
});

test('finalize: the prior artifact JSON is byte-identical after the finalizer has run', async () => {
	for (const c of CASES) {
		const repo = mkdtempSync(join(tmpdir(), 'insrc-carry-ro-'));
		try {
			c.seed(repo);
			const jsonPath = artifactJsonPath(repo, c.artifactId);
			const first = await finalize(c.intent(repo), c.emit(), `wf-first-${c.name}`);
			await storeWithComments(repo, c.artifactId, first, `docs/${c.name}.md`);
			const before = readFileSync(jsonPath);

			await finalize(c.intent(repo), c.emit(), `wf-again-${c.name}`);
			assert.ok(readFileSync(jsonPath).equals(before), `${c.name}: the finalizer only read the prior JSON`);
		} finally { resetLifecycleRegistry(); rmSync(repo, { recursive: true, force: true }); }
	}
});
