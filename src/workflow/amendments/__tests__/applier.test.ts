/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Amendment applier unit tests — one per amendment type + invariants.
 *
 * Run:
 *   npx tsx --test src/insrc/workflow/amendments/__tests__/applier.test.ts
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import type { HldBody } from '../../artifacts/hld.js';
import { AmendmentApplyError, applyAmendments } from '../applier.js';
import type { Amendment, AmendmentRecord } from '../types.js';

function baseBody(): HldBody {
	return {
		frameworkSummary: 'Extract TagFilter service.',
		architectureShape: 'TagFilter owns the index; sidebar consumes it.',
		sharedContracts: [
			{
				id: 'sc1', name: 'TagFilterAPI', purpose: 'Query todos by a single tag',
				interfaceSketch: 'interface TagFilterAPI { list(tag: string): Todo[]; }',
				ownedByStory: 's1', consumedByStories: ['s2'], assumptions: ['c1'],
			},
		],
		storyBoundaries: [
			{ storyId: 's1', owns: ['sc1'], depends: [], internal: 'index storage private' },
			{ storyId: 's2', owns: [], depends: ['sc1'], internal: 'UI state private' },
			{ storyId: 's3', owns: [], depends: [], internal: 'placeholder story for tests' },
		],
		nonFunctional: { performance: 'P50 < 20ms' },
		rolloutOverview: {
			phases: [
				{ name: 'Phase A', includesStories: ['s1'], rationale: 'contract first', backwardCompat: '', featureFlag: null },
				{ name: 'Phase B', includesStories: ['s2'], rationale: 'consumer next', backwardCompat: '', featureFlag: null },
				{ name: 'Phase C', includesStories: ['s3'], rationale: 'polish', backwardCompat: '', featureFlag: null },
			],
			orderingRationale: 's2 depends on sc1',
			riskyBits: [],
		},
		alternativesConsidered: [
			{ id: 'a1', name: 'Service', oneLineSummary: 'x', approach: 'x', pros: ['x'], cons: ['x'], costEstimate: 'S' },
			{ id: 'a2', name: 'Inline',  oneLineSummary: 'x', approach: 'x', pros: ['x'], cons: ['x'], costEstimate: 'XS', reasonRejected: 'perf' },
		],
		chosenAlternative: 'a1',
		openQuestions: [],
	};
}

function rec(id: string, amendment: Amendment): AmendmentRecord {
	return {
		id, epicSlug: 'test',
		hldBaseRunId: 'base', amendment,
		rationale: 'test', citations: [],
		proposedBy: { workflow: 'design.story', runId: 'r', stepId: 's4' },
		proposedAt: '2026-07-12T00:00:00Z', status: 'approved', approvedAt: '2026-07-12T01:00:00Z',
	};
}

// ---------------------------------------------------------------------------
// sharedContract.fieldAdd
// ---------------------------------------------------------------------------

test('fieldAdd appends a documented field marker to interfaceSketch', () => {
	const next = applyAmendments(baseBody(), [rec('a-1', {
		type: 'sharedContract.fieldAdd',
		contractId: 'sc1',
		field: { name: 'sortBy', type: 'string', optional: true, purpose: 'sort order' },
		breaking: false,
	})]);
	const sketch = next.sharedContracts[0]!.interfaceSketch;
	assert.match(sketch, /\+\s*sortBy\?: string;/);
	assert.match(sketch, /amend:a-1/);
});

test('fieldAdd refuses duplicate member name (matches methods too)', () => {
	// `list` is already declared as a method on the interface sketch.
	assert.throws(() => applyAmendments(baseBody(), [rec('a-1', {
		type: 'sharedContract.fieldAdd',
		contractId: 'sc1',
		field: { name: 'list', type: 'string', optional: false, purpose: 'x' },
		breaking: false,
	})]), (err: Error) => err instanceof AmendmentApplyError);
});

// ---------------------------------------------------------------------------
// sharedContract.fieldRemove
// ---------------------------------------------------------------------------

test('fieldRemove requires breaking=true + migrationCue', () => {
	assert.throws(() => applyAmendments(baseBody(), [rec('a-2', {
		type: 'sharedContract.fieldRemove',
		contractId: 'sc1', fieldName: 'list',
		breaking: false as unknown as true,
		migrationCue: 'x',
	})]));
	assert.throws(() => applyAmendments(baseBody(), [rec('a-2', {
		type: 'sharedContract.fieldRemove',
		contractId: 'sc1', fieldName: 'list',
		breaking: true, migrationCue: '',
	})]));
});

test('fieldRemove appends removal marker', () => {
	const next = applyAmendments(baseBody(), [rec('a-2', {
		type: 'sharedContract.fieldRemove',
		contractId: 'sc1', fieldName: 'list',
		breaking: true, migrationCue: 'callers should use listMany',
	})]);
	assert.match(next.sharedContracts[0]!.interfaceSketch, /-\s*list\s+removed/);
});

// ---------------------------------------------------------------------------
// sharedContract.rename
// ---------------------------------------------------------------------------

test('rename swaps the contract name', () => {
	const next = applyAmendments(baseBody(), [rec('a-3', {
		type: 'sharedContract.rename',
		contractId: 'sc1', oldName: 'TagFilterAPI', newName: 'TodoTagQuery',
		breaking: true, migrationCue: 'update all import sites',
	})]);
	assert.equal(next.sharedContracts[0]!.name, 'TodoTagQuery');
});

test('rename refuses when oldName does not match', () => {
	assert.throws(() => applyAmendments(baseBody(), [rec('a-3', {
		type: 'sharedContract.rename',
		contractId: 'sc1', oldName: 'WrongName', newName: 'x',
		breaking: true, migrationCue: 'x',
	})]));
});

// ---------------------------------------------------------------------------
// sharedContract.methodAdd
// ---------------------------------------------------------------------------

test('methodAdd rejects signatures with function body', () => {
	assert.throws(() => applyAmendments(baseBody(), [rec('a-4', {
		type: 'sharedContract.methodAdd',
		contractId: 'sc1',
		method: { name: 'count', signature: 'count(): number { return 0 }', purpose: 'p' },
	})]));
});

test('methodAdd appends a signature marker', () => {
	const next = applyAmendments(baseBody(), [rec('a-4', {
		type: 'sharedContract.methodAdd',
		contractId: 'sc1',
		method: { name: 'count', signature: 'count(tag: string): number', purpose: 'count matches' },
	})]);
	assert.match(next.sharedContracts[0]!.interfaceSketch, /count\(tag: string\): number/);
});

// ---------------------------------------------------------------------------
// storyBoundary.reassignOwnership
// ---------------------------------------------------------------------------

test('reassignOwnership moves ownership from oldOwner to newOwner', () => {
	const next = applyAmendments(baseBody(), [rec('a-5', {
		type: 'storyBoundary.reassignOwnership',
		contractId: 'sc1', oldOwner: 's1', newOwner: 's3', rationale: 'load balancing',
	})]);
	assert.equal(next.sharedContracts[0]!.ownedByStory, 's3');
	const s1 = next.storyBoundaries.find(sb => sb.storyId === 's1')!;
	const s3 = next.storyBoundaries.find(sb => sb.storyId === 's3')!;
	assert.deepEqual(s1.owns, []);
	assert.deepEqual(s3.owns, ['sc1']);
});

test('reassignOwnership refuses wrong oldOwner', () => {
	assert.throws(() => applyAmendments(baseBody(), [rec('a-5', {
		type: 'storyBoundary.reassignOwnership',
		contractId: 'sc1', oldOwner: 's9', newOwner: 's3', rationale: 'x',
	})]));
});

// ---------------------------------------------------------------------------
// storyBoundary.addConsumer
// ---------------------------------------------------------------------------

test('addConsumer appends consumer + depends edge', () => {
	const next = applyAmendments(baseBody(), [rec('a-6', {
		type: 'storyBoundary.addConsumer',
		contractId: 'sc1', consumer: 's3',
	})]);
	assert.deepEqual(next.sharedContracts[0]!.consumedByStories, ['s2', 's3']);
	const s3 = next.storyBoundaries.find(sb => sb.storyId === 's3')!;
	assert.deepEqual(s3.depends, ['sc1']);
});

test('addConsumer refuses when consumer is already the owner', () => {
	assert.throws(() => applyAmendments(baseBody(), [rec('a-6', {
		type: 'storyBoundary.addConsumer',
		contractId: 'sc1', consumer: 's1',   // s1 owns sc1
	})]));
});

// ---------------------------------------------------------------------------
// nonFunctional.retarget
// ---------------------------------------------------------------------------

test('nonFunctional.retarget swaps target value', () => {
	const next = applyAmendments(baseBody(), [rec('a-7', {
		type: 'nonFunctional.retarget',
		property: 'performance', oldTarget: 'P50 < 20ms', newTarget: 'P50 < 10ms', rationale: 'better SLO',
	})]);
	assert.equal(next.nonFunctional.performance, 'P50 < 10ms');
});

test('nonFunctional.retarget refuses when property is unset', () => {
	assert.throws(() => applyAmendments(baseBody(), [rec('a-7', {
		type: 'nonFunctional.retarget',
		property: 'security', oldTarget: 'x', newTarget: 'y', rationale: 'x',
	})]));
});

// ---------------------------------------------------------------------------
// rollout.reorder
// ---------------------------------------------------------------------------

test('rollout.reorder permutes phase order', () => {
	const next = applyAmendments(baseBody(), [rec('a-8', {
		type: 'rollout.reorder',
		newPhaseOrder: ['Phase C', 'Phase A', 'Phase B'],
	})]);
	assert.deepEqual(next.rolloutOverview.phases.map(p => p.name), ['Phase C', 'Phase A', 'Phase B']);
});

test('rollout.reorder refuses non-permutations', () => {
	assert.throws(() => applyAmendments(baseBody(), [rec('a-8', {
		type: 'rollout.reorder',
		newPhaseOrder: ['Phase X', 'Phase A', 'Phase B'],
	})]));
});

// ---------------------------------------------------------------------------
// rollout.splitPhase
// ---------------------------------------------------------------------------

test('rollout.splitPhase divides one phase into two', () => {
	const base = baseBody();
	// Give Phase A two stories to split.
	const seeded: HldBody = {
		...base,
		storyBoundaries: [...base.storyBoundaries, { storyId: 's4', owns: [], depends: [], internal: 'x' }],
		rolloutOverview: {
			...base.rolloutOverview,
			phases: [
				{ name: 'Phase A', includesStories: ['s1', 's4'], rationale: 'r', backwardCompat: '', featureFlag: null },
				...base.rolloutOverview.phases.slice(1),
			],
		},
	};
	const next = applyAmendments(seeded, [rec('a-9', {
		type: 'rollout.splitPhase',
		phase: 'Phase A',
		newPhases: [
			{ name: 'Phase A1', includesStories: ['s1'] },
			{ name: 'Phase A2', includesStories: ['s4'] },
		],
	})]);
	const names = next.rolloutOverview.phases.map(p => p.name);
	assert.deepEqual(names, ['Phase A1', 'Phase A2', 'Phase B', 'Phase C']);
});

test('rollout.splitPhase refuses when union of new stories != original stories', () => {
	assert.throws(() => applyAmendments(baseBody(), [rec('a-9', {
		type: 'rollout.splitPhase',
		phase: 'Phase A',
		newPhases: [{ name: 'Phase A1', includesStories: [] }, { name: 'Phase A2', includesStories: ['s2'] }],
	})]));
});

// ---------------------------------------------------------------------------
// rollout.mergePhases
// ---------------------------------------------------------------------------

test('rollout.mergePhases merges a contiguous run', () => {
	const next = applyAmendments(baseBody(), [rec('a-10', {
		type: 'rollout.mergePhases',
		phases: ['Phase A', 'Phase B'],
		newPhase: { name: 'Phase AB' },
	})]);
	const names = next.rolloutOverview.phases.map(p => p.name);
	assert.deepEqual(names, ['Phase AB', 'Phase C']);
	const merged = next.rolloutOverview.phases[0]!;
	assert.deepEqual(merged.includesStories, ['s1', 's2']);
});

test('rollout.mergePhases refuses non-contiguous phases', () => {
	assert.throws(() => applyAmendments(baseBody(), [rec('a-10', {
		type: 'rollout.mergePhases',
		phases: ['Phase A', 'Phase C'],
		newPhase: { name: 'Phase AC' },
	})]));
});

// ---------------------------------------------------------------------------
// Composition + determinism
// ---------------------------------------------------------------------------

test('applyAmendments is deterministic (same inputs → same outputs)', () => {
	const amendments = [rec('a-1', {
		type: 'sharedContract.fieldAdd',
		contractId: 'sc1',
		field: { name: 'sortBy', type: 'string', optional: true, purpose: 'sort order' },
		breaking: false,
	})];
	const a = applyAmendments(baseBody(), amendments);
	const b = applyAmendments(baseBody(), amendments);
	assert.equal(JSON.stringify(a), JSON.stringify(b));
});
