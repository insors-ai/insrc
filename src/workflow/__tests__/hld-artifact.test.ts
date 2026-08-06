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
	reconcileDependsFromConsumers,
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

test('checkContractDependencyGraph cg2 message names the nearest-common-ancestor re-ownership target', () => {
	// Cross-cutting contract owned by s3 but consumed by s2, which is in a
	// different branch (both s2 and s3 depend only on s1). The PREFERRED FIX
	// must name s1 — the common ancestor — as the re-ownership target.
	const body: HldBody = {
		...fixtureBody(),
		sharedContracts: [
			{ id: 'gate', name: 'Compliance', purpose: 'cross-cutting gate', interfaceSketch: 'interface Gate { check(): void }', ownedByStory: 's3', consumedByStories: ['s2'], assumptions: [] },
		],
		storyBoundaries: [
			{ storyId: 's1', owns: [], depends: [], internal: '' },
			{ storyId: 's2', owns: [], depends: ['gate'], internal: '' },
			{ storyId: 's3', owns: ['gate'], depends: [], internal: '' },
		],
	};
	const dag = [
		{ id: 's1', dependsOn: [] as string[] },
		{ id: 's2', dependsOn: ['s1'] },
		{ id: 's3', dependsOn: ['s1'] },
	];
	const cg2 = checkContractDependencyGraph(body, dag).find(i => /cg2/.test(i));
	assert.ok(cg2, 'expected a cg2 issue');
	assert.match(cg2!, /re-own 'gate' at 's1'/);
	assert.match(cg2!, /CANNOT amend the Epic Story graph/);
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

// ---------------------------------------------------------------------------
// reconcileDependsFromConsumers (S002) — depends is DERIVED from consumedByStories
// ---------------------------------------------------------------------------

// A drifted body: s1 phantom-depends on the contract it owns; s2 omits the sc1
// it actually consumes. This is exactly the fixture cg3 rejects above.
function driftedBody(): HldBody {
	return {
		...fixtureBody(),
		storyBoundaries: [
			{ storyId: 's1', owns: ['sc1'], depends: ['sc1'], internal: 'x' }, // phantom self-depend
			{ storyId: 's2', owns: [], depends: [], internal: 'y' },            // missing edge
		],
	};
}

test('reconcileDependsFromConsumers repairs a drifted depends so cg3 passes (S002 ac2)', () => {
	const before = checkContractDependencyGraph(driftedBody(), EPIC_DAG);
	assert.ok(before.some(i => /cg3/.test(i)), 'the fixture drifts before reconcile');
	const fixed = reconcileDependsFromConsumers(driftedBody());
	assert.equal(checkContractDependencyGraph(fixed, EPIC_DAG).filter(i => /cg3/.test(i)).length, 0);
	// derived exactly: s1 (owner, no consumption) -> []; s2 (consumes sc1) -> ['sc1']
	assert.deepEqual(fixed.storyBoundaries.find(sb => sb.storyId === 's1')!.depends, []);
	assert.deepEqual(fixed.storyBoundaries.find(sb => sb.storyId === 's2')!.depends, ['sc1']);
});

test('reconcileDependsFromConsumers is a pure inverse: dedup+sort, self-skip, other fields untouched (S002 ac2)', () => {
	// sc2 consumed by s2 twice (dup) + owned by s1 also listed (self) — reconcile
	// dedups, sorts, and skips the self edge.
	const body: HldBody = {
		...fixtureBody(),
		sharedContracts: [
			{ id: 'sc1', name: 'A', purpose: 'p', interfaceSketch: 'interface A { x(): void }', ownedByStory: 's1', consumedByStories: ['s2'], assumptions: [] },
			{ id: 'sc2', name: 'B', purpose: 'p', interfaceSketch: 'interface B { y(): void }', ownedByStory: 's1', consumedByStories: ['s1', 's2', 's2'], assumptions: [] },
		],
		storyBoundaries: [
			{ storyId: 's1', owns: ['sc1', 'sc2'], depends: ['sc2'], internal: 'x' },
			{ storyId: 's2', owns: [], depends: [], internal: 'y' },
		],
	};
	const fixed = reconcileDependsFromConsumers(body);
	// s1 owns both, consumes neither (self-skip) -> []; s2 -> ['sc1','sc2'] sorted, deduped
	assert.deepEqual(fixed.storyBoundaries.find(sb => sb.storyId === 's1')!.depends, []);
	assert.deepEqual(fixed.storyBoundaries.find(sb => sb.storyId === 's2')!.depends, ['sc1', 'sc2']);
	// consumedByStories + sharedContracts + ownedByStory are byte-identical
	assert.deepEqual(fixed.sharedContracts, body.sharedContracts);
	assert.equal(fixed.frameworkSummary, body.frameworkSummary);
});

test('reconcileDependsFromConsumers does NOT mask a genuine cg1 cycle (S002 ac3)', () => {
	const cyclic: HldBody = {
		...fixtureBody(),
		sharedContracts: [
			...fixtureBody().sharedContracts,
			{ id: 'sc2', name: 'Rev', purpose: 'p', interfaceSketch: 'interface Rev { x(): void }', ownedByStory: 's2', consumedByStories: ['s1'], assumptions: [] },
		],
		storyBoundaries: [
			{ storyId: 's1', owns: ['sc1'], depends: [], internal: '' },
			{ storyId: 's2', owns: ['sc2'], depends: [], internal: '' },
		],
	};
	// even after reconcile (which only touches depends), the cg1 cycle over
	// consumedByStories still fires.
	const issues = checkContractDependencyGraph(reconcileDependsFromConsumers(cyclic), EPIC_DAG);
	assert.ok(issues.some(i => /cg1/.test(i)), issues.join(' | '));
});

test('reconcileDependsFromConsumers does NOT mask a genuine cg2 inversion (S002 ac3)', () => {
	// s2 consumes s1's sc1 but does NOT depend on s1 in the Epic graph.
	const noDep = [{ id: 's1', dependsOn: [] as string[] }, { id: 's2', dependsOn: [] as string[] }];
	const issues = checkContractDependencyGraph(reconcileDependsFromConsumers(fixtureBody()), noDep);
	assert.ok(issues.some(i => /cg2/.test(i)), issues.join(' | '));
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
