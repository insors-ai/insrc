/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * End-to-end `define` EXTEND branch. The scope classifier (s1
 * `scope.assess`) decides `extend`; s2 `epic.frame` + s3
 * `stories.compose` auto-skip; s4 `checklist.verify` audits the
 * extension; synthesize executes the extension deterministically:
 *   - appends the new Story to the target Epic's Define,
 *   - proposes a pending `storyBoundary.addStory` HLD amendment,
 *   - writes an ExtendArtifact (EXT-*.{md,json}).
 *
 * Proves the follow-on `design.story` becomes runnable once the
 * amendment + Epic are approved (Story visible in Define + effective HLD).
 *
 * Run:
 *   npx tsx --test src/insrc/mcp/workflow-step/__tests__/define-extend-e2e.test.ts
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

import { handleWorkflowStep } from '../handler.js';
import { registerWorkflowRunners } from '../../../workflow/index.js';
import { _clearWorkflowStateStoreForTests } from '../state-store.js';
import { approveArtifactByJsonPath, requireApprovedHld } from '../../../workflow/gates.js';
import { approveAmendment } from '../../../workflow/amendments/store.js';
import { defineArtifactPaths, extendArtifactPaths, hldArtifactPaths, ARTIFACTS_DIR } from '../../../workflow/storage.js';

interface Envelope {
	readonly content: readonly { readonly type: 'text'; readonly text: string }[];
	readonly isError?: boolean;
}
function payload(env: Envelope): Record<string, unknown> {
	const first = env.content[0];
	assert.ok(first !== undefined);
	return JSON.parse(first.text) as Record<string, unknown>;
}

const HASH = 'a3f4b8c9d1e2f3a4';

/** Seed an approved Define + approved HLD for the extend target. */
function seed(repo: string): void {
	const definePaths = defineArtifactPaths(repo, HASH);
	mkdirSync(dirname(definePaths.json), { recursive: true });
	writeFileSync(definePaths.json, JSON.stringify({
		meta: { workflow: 'define', runId: 'define-1', schemaVersion: 1, epicHash: HASH, epicSlug: 'tag-filtering' },
		body: {
			flavor: 'enhancement',
			problem: 'Users cannot filter todos by tag today; only status filtering exists.',
			nonGoals: [],
			assumptions: [{ text: 'Todos have tags', confidence: 'high', source: 'c1' }],
			constraints: [{ id: 'k1', text: 'Reuse sidebar', type: 'convention', source: 'c1' }],
			stories: [
				{ id: 's1', title: 'Filter by tag', userValue: 'v', acceptanceCriteria: [{ id: 'ac1', given: 'x', when: 'y', then: 'z', operationalizes: ['k1'] }] },
			],
			openQuestions: [],
		},
		citations: [{ id: 'c1', kind: 'analyze-bundle', ref: 'todos module' }],
	}, null, 2));
	approveArtifactByJsonPath(definePaths.json);

	const hldPaths = hldArtifactPaths(repo, HASH);
	mkdirSync(dirname(hldPaths.json), { recursive: true });
	writeFileSync(hldPaths.json, JSON.stringify({
		meta: { workflow: 'design.epic', runId: 'hld-run-1', schemaVersion: 1, epicHash: HASH, epicSlug: 'tag-filtering' },
		body: {
			frameworkSummary: 'Extract TagFilter service.',
			architectureShape: 'TagFilter owns the tag index [[c1]].',
			sharedContracts: [
				{ id: 'sc1', name: 'TagFilterAPI', purpose: 'Query todos by a single tag', interfaceSketch: 'interface TagFilterAPI { list(tag: string): Todo[] }', ownedByStory: 's1', consumedByStories: [], assumptions: ['c1'] },
			],
			storyBoundaries: [
				{ storyId: 's1', owns: ['sc1'], depends: [], internal: 'index storage private' },
			],
			nonFunctional: { performance: 'P50 < 20ms' },
			rolloutOverview: {
				phases: [{ name: 'Phase A', includesStories: ['s1'], rationale: 'contract first', backwardCompat: '', featureFlag: null }],
				orderingRationale: 'single phase', riskyBits: [],
			},
			alternativesConsidered: [
				{ id: 'a1', name: 'Service', oneLineSummary: 'x', approach: 'own the index', pros: ['x'], cons: ['x'], costEstimate: 'S' },
				{ id: 'a2', name: 'Inline', oneLineSummary: 'x', approach: 'sidebar scans', pros: ['x'], cons: ['x'], costEstimate: 'XS', reasonRejected: 'perf' },
			],
			chosenAlternative: 'a1',
			openQuestions: [],
		},
		citations: [{ id: 'c1', kind: 'analyze-bundle', ref: 'todos module' }],
	}, null, 2));
	approveArtifactByJsonPath(hldPaths.json);
}

const s1Extend = {
	decision: 'extend' as const,
	scope: 'S' as const,
	notify: 'Extends Epic `tag-filtering` — building on DEF/HLD + src/todos/*; no new Epic.',
	evidence: [
		{ kind: 'doc', ref: 'docs/defines/DEF-tag-filtering.md', quote: 'tag filtering epic' },
		{ kind: 'code', ref: 'src/todos/filter.ts' },
	],
	target: { epicHash: HASH, epicSlug: 'tag-filtering' },
	newStory: {
		title: 'Clear the active tag filter',
		userValue: 'Users reset back to the full list in one click.',
		acceptanceCriteria: [
			{ given: 'a tag filter is active', when: 'the user clicks clear', then: 'all todos are shown again' },
		],
	},
	flavor: 'enhancement' as const,
	flavorEvidence: { classifierHint: 'enhancement' as const, capabilityProbeVerdict: 'clear-match' as const, reasoning: 'existing tag-filtering Epic covers this.' },
	analyzeBundles: [
		{ kind: 'capability-discovery', focus: 'is tag filtering already designed?', summary: 'Yes — the tag-filtering Epic + HLD exist; this is a small extension.', pathsCited: ['src/todos/filter.ts'] },
	],
};

const s4Passed = {
	results: [
		{ itemId: 'x1', verdict: 'passed', evidence: 's1' },
		{ itemId: 'sb1', verdict: 'passed', evidence: 's1' },
		{ itemId: 'sb3', verdict: 'passed', evidence: 's1' },
	],
};

test('define EXTEND: scope=extend → skip frame/compose → append Story + pending amendment + ExtendArtifact', async () => {
	registerWorkflowRunners();
	_clearWorkflowStateStoreForTests();
	const repo = mkdtempSync(join(tmpdir(), 'insrc-extend-'));
	try {
		seed(repo);

		const startOut = payload(await handleWorkflowStep({ phase: 'start', workflow: 'define', focus: 'add a clear-filter button to tag filtering', repo }));
		assert.equal(startOut['next'], 'emit_plan');
		let state = startOut['state'] as string;

		const planOut = payload(await handleWorkflowStep({
			phase: 'plan',
			plan: { workflow: 'define', steps: [
				{ id: 's1', runner: 'scope.assess',     params: {} },
				{ id: 's2', runner: 'epic.frame',       params: {} },
				{ id: 's3', runner: 'stories.compose',  params: {} },
				{ id: 's4', runner: 'checklist.verify', params: {} },
			] },
			state,
		}));
		assert.equal(planOut['next'], 'emit_step');
		assert.equal(planOut['stepId'], 's1');
		state = planOut['state'] as string;

		// s1 scope.assess → decides extend. s2 + s3 auto-skip, so the next
		// pause is s4 checklist.verify.
		const afterS1 = payload(await handleWorkflowStep({ phase: 'step', stepId: 's1', response: s1Extend, state }));
		assert.equal(afterS1['next'], 'emit_step');
		assert.equal(afterS1['stepId'], 's4', `expected skip to s4, got ${JSON.stringify(afterS1['stepId'])}`);
		state = afterS1['state'] as string;

		const afterS4 = payload(await handleWorkflowStep({ phase: 'step', stepId: 's4', response: s4Passed, state }));
		assert.equal(afterS4['next'], 'emit_synthesize');
		state = afterS4['state'] as string;

		const done = payload(await handleWorkflowStep({ phase: 'synthesize', artifact: { acknowledged: true }, state }));
		assert.equal(done['next'], 'done', JSON.stringify(done));

		// ExtendArtifact written under EXT-* (not DEF-*).
		const extPaths = extendArtifactPaths(repo, HASH, 's2', 'tag-filtering');
		assert.ok(existsSync(extPaths.json), 'EXT json written');
		assert.ok(existsSync(extPaths.md), 'EXT md written');
		const md = readFileSync(extPaths.md, 'utf8');
		assert.match(md, /Extends Epic `tag-filtering`/);
		assert.match(md, /Clear the active tag filter/);

		// The Story was appended to the target Define (s2), approval retained.
		const define = JSON.parse(readFileSync(defineArtifactPaths(repo, HASH).json, 'utf8')) as { meta: { approvedAt?: string }; body: { stories: { id: string }[] } };
		assert.deepEqual(define.body.stories.map(s => s.id), ['s1', 's2']);
		assert.ok(define.meta.approvedAt, 'target Epic approval retained');

		// A pending storyBoundary.addStory amendment was filed.
		const amdFiles = readdirSync(join(repo, ARTIFACTS_DIR)).filter(n => n.startsWith(`AMD-${HASH}-`));
		assert.equal(amdFiles.length, 1);
		const amd = JSON.parse(readFileSync(join(repo, ARTIFACTS_DIR, amdFiles[0]!), 'utf8')) as { status: string; amendment: { type: string; storyId: string } };
		assert.equal(amd.status, 'pending');
		assert.equal(amd.amendment.type, 'storyBoundary.addStory');
		assert.equal(amd.amendment.storyId, 's2');

		// After approving the amendment, the new Story is in the effective HLD.
		approveAmendment(repo, `AMD-${HASH}-1`, 'tester');
		const eff = requireApprovedHld(repo, HASH);
		assert.ok(eff.body.storyBoundaries.some(b => b.storyId === 's2'), 'effective HLD carries the new Story boundary');
	} finally {
		rmSync(repo, { recursive: true, force: true });
	}
});

test('define EXTEND: s4 scope-boundary hard-fail refuses synthesize (no Story appended)', async () => {
	registerWorkflowRunners();
	_clearWorkflowStateStoreForTests();
	const repo = mkdtempSync(join(tmpdir(), 'insrc-extend-fail-'));
	try {
		seed(repo);
		const startOut = payload(await handleWorkflowStep({ phase: 'start', workflow: 'define', focus: 'add clear-filter', repo }));
		let state = startOut['state'] as string;
		const planOut = payload(await handleWorkflowStep({
			phase: 'plan',
			plan: { workflow: 'define', steps: [
				{ id: 's1', runner: 'scope.assess',     params: {} },
				{ id: 's2', runner: 'epic.frame',       params: {} },
				{ id: 's3', runner: 'stories.compose',  params: {} },
				{ id: 's4', runner: 'checklist.verify', params: {} },
			] },
			state,
		}));
		state = planOut['state'] as string;
		const afterS1 = payload(await handleWorkflowStep({ phase: 'step', stepId: 's1', response: s1Extend, state }));
		state = afterS1['state'] as string;
		const s4Fail = { results: [{ itemId: 'sb1', verdict: 'missed', evidence: 's1', notes: 'newStory leaks API shape' }] };
		const afterS4 = payload(await handleWorkflowStep({ phase: 'step', stepId: 's4', response: s4Fail, state }));
		state = afterS4['state'] as string;
		const done = payload(await handleWorkflowStep({ phase: 'synthesize', artifact: { acknowledged: true }, state }));
		assert.equal(done['next'], 'error', JSON.stringify(done));

		// No side effects: the target Define was NOT mutated, no amendment filed.
		const define = JSON.parse(readFileSync(defineArtifactPaths(repo, HASH).json, 'utf8')) as { body: { stories: { id: string }[] } };
		assert.deepEqual(define.body.stories.map(s => s.id), ['s1']);
		const amdFiles = readdirSync(join(repo, ARTIFACTS_DIR)).filter(n => n.startsWith(`AMD-${HASH}-`));
		assert.equal(amdFiles.length, 0);
	} finally {
		rmSync(repo, { recursive: true, force: true });
	}
});
