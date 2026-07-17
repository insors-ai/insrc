/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * HldArtifact renderer + cross-artifact invariant tests.
 *
 * Run:
 *   npx tsx --test src/insrc/workflow/__tests__/hld-artifact.test.ts
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
	checkContractDependencyGraph,
	checkInterfaceSketchTypeLevel,
	checkOwnershipConsistency,
	checkRolloutCoverage,
	checkStoryCoverage,
	isHldBody,
	renderHldMarkdown,
	type HldArtifact,
	type HldBody,
} from '../artifacts/hld.js';

// ---------------------------------------------------------------------------
// Fixture
// ---------------------------------------------------------------------------

function fixtureBody(): HldBody {
	return {
		frameworkSummary: 'Extract a small TagFilter service that the todos sidebar consumes.',
		architectureShape: 'The TagFilter service owns the tag→todos index and returns filtered results. The sidebar mounts a TagFilterPanel that queries it.',
		sharedContracts: [
			{
				id: 'sc1', name: 'TagFilterAPI', purpose: 'Query todos by a single tag',
				interfaceSketch: 'interface TagFilterAPI { list(tag: string): Todo[] }',
				ownedByStory: 's1', consumedByStories: ['s2'], assumptions: [],
			},
		],
		storyBoundaries: [
			{ storyId: 's1', owns: ['sc1'], depends: [], internal: 'Tag→todos index storage stays private to s1.' },
			{ storyId: 's2', owns: [], depends: ['sc1'], internal: 'Clear-filter UI state is s2-local.' },
		],
		nonFunctional: { performance: 'list() P50 < 20ms on 10k todos' },
		rolloutOverview: {
			phases: [
				{ name: 'Phase A — service', includesStories: ['s1'], rationale: 'contract landing', backwardCompat: '', featureFlag: null },
				{ name: 'Phase B — UI',      includesStories: ['s2'], rationale: 'consumer wires up', backwardCompat: '', featureFlag: null },
			],
			orderingRationale: 's2 depends on sc1 from s1.',
			riskyBits: [{ area: 'index memory', why: 'grows with tags', mitigation: 'LRU eviction' }],
		},
		alternativesConsidered: [
			{ id: 'a1', name: 'Extract TagFilter service', oneLineSummary: 'Own the index in a service', approach: 'A dedicated module owns the index and query surface.', pros: ['clear contract'], cons: ['more modules'], costEstimate: 'S' },
			{ id: 'a2', name: 'Inline in sidebar', oneLineSummary: 'Sidebar computes on-the-fly', approach: 'The sidebar scans all todos each open.', pros: ['no new module'], cons: ['O(n) per open'], costEstimate: 'XS', reasonRejected: 'Fails perf constraint on 10k todos.' },
		],
		chosenAlternative: 'a1',
		openQuestions: [],
	};
}

// ---------------------------------------------------------------------------
// Renderer
// ---------------------------------------------------------------------------

test('renderHldMarkdown emits all sections', () => {
	const artifact: HldArtifact = {
		meta: {
			workflow: 'design.epic', runId: 'r', repoPath: '/', createdAt: '', model: 'client',
			elapsedMs: 0, repoIndexedAt: null, schemaVersion: 1,
		},
		body: fixtureBody(),
		citations: [{ id: 'c1', kind: 'analyze-bundle', ref: 'todos module' }],
	};
	const md = renderHldMarkdown(artifact);
	assert.ok(md.includes('# HLD:'));
	assert.ok(md.includes('## Framework summary'));
	assert.ok(md.includes('## Architecture shape'));
	assert.ok(md.includes('## Shared contracts'));
	assert.ok(md.includes('### sc1:'));
	assert.ok(md.includes('## Story boundaries'));
	assert.ok(md.includes('### Story `s1`'));
	assert.ok(md.includes('## Non-functional targets'));
	assert.ok(md.includes('## Rollout'));
	assert.ok(md.includes('Phase A'));
	assert.ok(md.includes('## Alternatives considered'));
	assert.ok(md.includes('### a1:'));
	assert.ok(md.includes('**CHOSEN**'));
	assert.ok(md.includes('### a2:'));
	assert.ok(md.includes('**Rejected because:**'));
});

test('renderHldMarkdown adds a Tracker link only when meta.tracker.epicRef is set', () => {
	const meta = { workflow: 'design.epic', runId: 'r', repoPath: '/', createdAt: '', model: 'client', elapsedMs: 0, repoIndexedAt: null, schemaVersion: 1 };
	const base = { meta, body: fixtureBody(), citations: [] } as unknown as HldArtifact;
	assert.doesNotMatch(renderHldMarkdown(base), /\*\*Tracker:\*\*/);
	const linked = { meta: { ...meta, tracker: { epicRef: 'acme/demo#7' } }, body: fixtureBody(), citations: [] } as unknown as HldArtifact;
	assert.match(renderHldMarkdown(linked), /\*\*Tracker:\*\* \[acme\/demo#7\]\(https:\/\/github\.com\/acme\/demo\/issues\/7\)/);
});

// ---------------------------------------------------------------------------
// isHldBody
// ---------------------------------------------------------------------------

test('isHldBody accepts valid body', () => {
	assert.equal(isHldBody(fixtureBody()), true);
});

test('isHldBody rejects missing storyBoundaries', () => {
	const bad = { ...fixtureBody() } as Record<string, unknown>;
	delete bad['storyBoundaries'];
	assert.equal(isHldBody(bad), false);
});

// ---------------------------------------------------------------------------
// checkStoryCoverage
// ---------------------------------------------------------------------------

test('checkStoryCoverage passes when every Epic Story has a boundary', () => {
	assert.deepEqual(checkStoryCoverage(fixtureBody(), ['s1', 's2']), []);
});

test('checkStoryCoverage flags orphan Epic Stories', () => {
	const issues = checkStoryCoverage(fixtureBody(), ['s1', 's2', 's3']);
	assert.equal(issues.length, 1);
	assert.match(issues[0]!, /s3/);
});

// ---------------------------------------------------------------------------
// checkContractDependencyGraph
// ---------------------------------------------------------------------------

// s2 dependsOn s1 — matches the fixture (s2 consumes s1's sc1).
const EPIC_DAG = [{ id: 's1', dependsOn: [] as string[] }, { id: 's2', dependsOn: ['s1'] }];

test('checkContractDependencyGraph passes on a consistent, acyclic graph', () => {
	assert.deepEqual(checkContractDependencyGraph(fixtureBody(), EPIC_DAG), []);
});

test('checkContractDependencyGraph flags a cycle (mutual consumption)', () => {
	const body: HldBody = {
		...fixtureBody(),
		sharedContracts: [
			...fixtureBody().sharedContracts,
			{ id: 'sc2', name: 'Rev', purpose: 'p', interfaceSketch: 'interface Rev { x(): void }', ownedByStory: 's2', consumedByStories: ['s1'], assumptions: [] },
		],
		storyBoundaries: [
			{ storyId: 's1', owns: ['sc1'], depends: ['sc2'], internal: '' },
			{ storyId: 's2', owns: ['sc2'], depends: ['sc1'], internal: '' },
		],
	};
	const issues = checkContractDependencyGraph(body, EPIC_DAG);
	assert.ok(issues.some(i => /cg1/.test(i)), issues.join(' | '));
});

test('checkContractDependencyGraph flags an inversion (consumer not downstream of owner)', () => {
	// s2 does NOT depend on s1, yet consumes s1's sc1.
	const issues = checkContractDependencyGraph(fixtureBody(), [{ id: 's1', dependsOn: [] as string[] }, { id: 's2', dependsOn: [] as string[] }]);
	assert.ok(issues.some(i => /cg2/.test(i)), issues.join(' | '));
});

test('checkContractDependencyGraph flags depends drift from consumedByStories', () => {
	const body: HldBody = {
		...fixtureBody(),
		storyBoundaries: [
			{ storyId: 's1', owns: ['sc1'], depends: ['sc1'], internal: '' }, // phantom: owns sc1, cannot depend on it
			{ storyId: 's2', owns: [], depends: [], internal: '' },            // omits sc1 it actually consumes
		],
	};
	const issues = checkContractDependencyGraph(body, EPIC_DAG);
	assert.ok(issues.some(i => /cg3/.test(i)), issues.join(' | '));
});

test('checkStoryCoverage flags shared contract owned by unknown Story', () => {
	const body: HldBody = {
		...fixtureBody(),
		sharedContracts: [
			{ ...fixtureBody().sharedContracts[0]!, ownedByStory: 's9' },
		],
	};
	const issues = checkStoryCoverage(body, ['s1', 's2']);
	assert.ok(issues.some(i => i.includes('s9')));
});

// ---------------------------------------------------------------------------
// checkRolloutCoverage
// ---------------------------------------------------------------------------

test('checkRolloutCoverage passes on clean fixture', () => {
	assert.deepEqual(checkRolloutCoverage(fixtureBody(), ['s1', 's2']), []);
});

test('checkRolloutCoverage flags story in multiple phases', () => {
	const body: HldBody = {
		...fixtureBody(),
		rolloutOverview: {
			...fixtureBody().rolloutOverview,
			phases: [
				{ name: 'A', includesStories: ['s1', 's2'], rationale: 'r', backwardCompat: '', featureFlag: null },
				{ name: 'B', includesStories: ['s2'],       rationale: 'r', backwardCompat: '', featureFlag: null },
			],
		},
	};
	const issues = checkRolloutCoverage(body, ['s1', 's2']);
	assert.ok(issues.some(i => i.includes("appears in 2")));
});

test('checkRolloutCoverage flags story in zero phases', () => {
	const body: HldBody = {
		...fixtureBody(),
		rolloutOverview: {
			...fixtureBody().rolloutOverview,
			phases: [{ name: 'A', includesStories: ['s1'], rationale: 'r', backwardCompat: '', featureFlag: null }],
		},
	};
	const issues = checkRolloutCoverage(body, ['s1', 's2']);
	assert.ok(issues.some(i => i.includes('not covered')));
});

// ---------------------------------------------------------------------------
// checkOwnershipConsistency
// ---------------------------------------------------------------------------

test('checkOwnershipConsistency passes on aligned fixture', () => {
	assert.deepEqual(checkOwnershipConsistency(fixtureBody()), []);
});

test('checkOwnershipConsistency flags mismatch between shared contract owner and boundary owner', () => {
	const body: HldBody = {
		...fixtureBody(),
		storyBoundaries: [
			{ storyId: 's1', owns: [],      depends: [],       internal: 'x' },
			{ storyId: 's2', owns: ['sc1'], depends: [],       internal: 'x' },
		],
	};
	const issues = checkOwnershipConsistency(body);
	assert.ok(issues.length > 0);
});

// ---------------------------------------------------------------------------
// checkInterfaceSketchTypeLevel
// ---------------------------------------------------------------------------

test('checkInterfaceSketchTypeLevel passes on pure TS interface', () => {
	assert.deepEqual(checkInterfaceSketchTypeLevel(fixtureBody()), []);
});

test('checkInterfaceSketchTypeLevel flags a return statement', () => {
	const body: HldBody = {
		...fixtureBody(),
		sharedContracts: [
			{ ...fixtureBody().sharedContracts[0]!, interfaceSketch: 'function list(tag) { return db.filter(tag); }' },
		],
	};
	const issues = checkInterfaceSketchTypeLevel(body);
	assert.ok(issues.length > 0);
});
