/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * S003 / sc3 — the `locateParent` tier-policy unit tests (t5).
 *
 * Pins every tier branch and the lc1 guarantees with FABRICATED deps — no DB, no
 * daemon. Proves the fixed order deterministic → graph-ownership → semantic →
 * prompt → standalone, the short-circuits, and that a low-confidence / ambiguous
 * / absent match NEVER auto-attaches (it defers to the prompt then standalone).
 *
 * Run:
 *   npx tsx --test src/workflow/__tests__/locate-parent.test.ts
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { locateParent } from '../locate/locate-parent.js';
import type {
	InferredCandidates,
	LocateParentDeps,
	LocateParentInput,
	RankedCandidate,
} from '../locate/types.js';
import type { ResolvedRef } from '../tracker/resolve.js';

// --- fabricated collaborators ---------------------------------------------

function fakeResolved(over: Partial<ResolvedRef> = {}): ResolvedRef {
	return {
		level:      'story',
		epicHash:   'deadbeefdeadbeef',
		epicSlug:   'the-epic',
		createdAt:  '2026-01-01T00:00:00.000Z',
		storyId:    's7',
		workflowId: 'E20260101deadbeef:S007',
		slug:       'the-epic:s7',
		...over,
	};
}

function cand(over: Partial<RankedCandidate> & { score: number }): RankedCandidate {
	return {
		parentRef: { slug: 'some-story', storyId: 's1' },
		evidence:  ['ev'],
		...over,
	};
}

interface DepOverrides {
	resolveRef?:      LocateParentDeps['resolveRef'];
	inferCandidates?: LocateParentDeps['inferCandidates'];
	promptForRef?:    LocateParentDeps['promptForRef'];
	thresholds?:      LocateParentDeps['thresholds'];
	inferCalls?:      { n: number };
}

function makeDeps(o: DepOverrides = {}): LocateParentDeps {
	const inferCalls = o.inferCalls ?? { n: 0 };
	return {
		repoPath:   '/repo',
		resolveRef: o.resolveRef ?? (() => null),
		inferCandidates: o.inferCandidates ?? (async () => { inferCalls.n++; return { graph: [], semantic: [] }; }),
		promptForRef: o.promptForRef ?? (async () => null),
		thresholds:   o.thresholds ?? { graph: 2, semantic: 0.75 },
	};
}

function input(over: Partial<LocateParentInput> = {}): LocateParentInput {
	return { touchedPaths: ['src/a.ts'], defectDescription: 'boom', ...over };
}

// --- tier 1: deterministic -------------------------------------------------

test('tier-1 explicit-ref hit → deterministic, short-circuits (inferCandidates never called)', async () => {
	const inferCalls = { n: 0 };
	const deps = makeDeps({
		resolveRef: () => fakeResolved(),
		inferCandidates: async () => { inferCalls.n++; return { graph: [], semantic: [] }; },
		inferCalls,
	});
	const res = await locateParent(input({ explicitRef: 'E20260101deadbeef:S007' }), deps);
	assert.equal(res.tier, 'deterministic');
	assert.equal(res.confidence, 1);
	assert.deepEqual(res.parentRef, { epicHash: 'deadbeefdeadbeef', storyId: 's7', slug: 'the-epic:s7' });
	assert.equal(inferCalls.n, 0, 'inference must not run on a deterministic hit');
});

test('stale explicitRef (resolveRef null) → falls through to inference tiers', async () => {
	const graph = [cand({ score: 3, parentRef: { slug: 'owner', storyId: 's2' } })];
	const res = await locateParent(
		input({ explicitRef: 'bogus#999' }),
		makeDeps({ resolveRef: () => null, inferCandidates: async () => ({ graph, semantic: [] }) }),
	);
	assert.equal(res.tier, 'graph-ownership');
	assert.deepEqual(res.parentRef, { slug: 'owner', storyId: 's2' });
});

// --- tier 2: graph-ownership ----------------------------------------------

test('graph candidate ≥ threshold → graph-ownership, semantic pass skipped (short-circuit)', async () => {
	let semanticAsked = false;
	const inferred: InferredCandidates = {
		graph:    [cand({ score: 4, parentRef: { slug: 'g' } })],
		get semantic() { semanticAsked = true; return [cand({ score: 1, parentRef: { slug: 's' } })]; },
	};
	const res = await locateParent(input(), makeDeps({ inferCandidates: async () => inferred }));
	assert.equal(res.tier, 'graph-ownership');
	assert.equal(res.confidence, 4);
	// The policy inspects graph first and returns before touching semantic.
	assert.equal(semanticAsked, false, 'semantic must not be consulted after a graph short-circuit');
});

// --- tier 3: semantic ------------------------------------------------------

test('graph empty/below-threshold, semantic ≥ threshold → semantic', async () => {
	const res = await locateParent(input(), makeDeps({
		inferCandidates: async () => ({
			graph:    [cand({ score: 1, parentRef: { slug: 'g' } })], // below graph threshold 2
			semantic: [cand({ score: 0.9, parentRef: { slug: 'sem', storyId: 's3' } })],
		}),
	}));
	assert.equal(res.tier, 'semantic');
	assert.deepEqual(res.parentRef, { slug: 'sem', storyId: 's3' });
});

test('semantic candidate just below threshold → defers to prompt (no silent attach)', async () => {
	let prompted = false;
	const res = await locateParent(input(), makeDeps({
		inferCandidates: async () => ({ graph: [], semantic: [cand({ score: 0.74, parentRef: { slug: 'sem' } })] }),
		promptForRef: async () => { prompted = true; return null; },
	}));
	assert.equal(prompted, true, 'a below-threshold semantic match must defer to the prompt');
	assert.equal(res.tier, 'standalone');
});

// --- lc1: ambiguity + degradation -----------------------------------------

test('tied graph candidates at/above threshold → defers to prompt (no arbitrary pick)', async () => {
	let prompted = false;
	const res = await locateParent(input(), makeDeps({
		inferCandidates: async () => ({
			graph: [
				cand({ score: 3, parentRef: { slug: 'a' } }),
				cand({ score: 3, parentRef: { slug: 'b' } }),
			],
			semantic: [],
		}),
		promptForRef: async () => { prompted = true; return null; },
	}));
	assert.equal(prompted, true, 'a tie must not be resolved arbitrarily');
	assert.equal(res.tier, 'standalone');
});

test('inferCandidates rejects/times out → degrades to prompt then standalone, never throws, never auto-attaches', async () => {
	let prompted = false;
	const res = await locateParent(input(), makeDeps({
		inferCandidates: async () => { throw new Error('daemon down'); },
		promptForRef: async () => { prompted = true; return null; },
	}));
	assert.equal(prompted, true);
	assert.equal(res.tier, 'standalone');
	assert.equal(res.parentRef, null);
});

test('empty defectDescription → semantic tier skipped, graph+prompt order preserved', async () => {
	// Inference returns no semantic (the daemon skips it); with a below-threshold
	// graph the policy still proceeds graph → prompt → standalone.
	let prompted = false;
	const res = await locateParent(
		input({ defectDescription: '   ' }),
		makeDeps({
			inferCandidates: async (req) => {
				assert.equal(req.defectDescription.trim(), '', 'request carries the empty description');
				return { graph: [cand({ score: 1, parentRef: { slug: 'g' } })], semantic: [] };
			},
			promptForRef: async () => { prompted = true; return null; },
		}),
	);
	assert.equal(prompted, true);
	assert.equal(res.tier, 'standalone');
});

// --- tier 4/5: prompt + standalone ----------------------------------------

test('nothing clears threshold → promptForRef; a resolvable ref attaches (prompt tier)', async () => {
	const res = await locateParent(input(), makeDeps({
		inferCandidates: async () => ({ graph: [], semantic: [] }),
		promptForRef: async () => 'the-epic:s7',
		resolveRef: (_repo, id) => id === 'the-epic:s7' ? fakeResolved() : null,
	}));
	assert.equal(res.tier, 'prompt');
	assert.equal(res.confidence, 1);
	assert.deepEqual(res.parentRef, { epicHash: 'deadbeefdeadbeef', storyId: 's7', slug: 'the-epic:s7' });
});

test('prompt with an unresolvable / empty ref → standalone, parentRef=null', async () => {
	const unresolvable = await locateParent(input(), makeDeps({
		promptForRef: async () => 'nope#1',
		resolveRef: () => null,
	}));
	assert.equal(unresolvable.tier, 'standalone');
	assert.equal(unresolvable.parentRef, null);

	const empty = await locateParent(input(), makeDeps({ promptForRef: async () => '' }));
	assert.equal(empty.tier, 'standalone');
	assert.equal(empty.parentRef, null);
});

// --- invariants ------------------------------------------------------------

test('malformed input (no paths, no description, no ref) throws', async () => {
	await assert.rejects(
		() => locateParent({ touchedPaths: [], defectDescription: '  ' }, makeDeps()),
		/malformed input/,
	);
});

test('ParentLocation shape invariant: parentRef non-null iff tier ≠ standalone; confidence ≥ threshold on attach', async () => {
	// graph attach
	const g = await locateParent(input(), makeDeps({
		inferCandidates: async () => ({ graph: [cand({ score: 2, parentRef: { slug: 'g' } })], semantic: [] }),
		thresholds: { graph: 2, semantic: 0.75 },
	}));
	assert.equal(g.tier, 'graph-ownership');
	assert.notEqual(g.parentRef, null);
	assert.ok(g.confidence >= 2);

	// standalone
	const s = await locateParent(input(), makeDeps());
	assert.equal(s.tier, 'standalone');
	assert.equal(s.parentRef, null);
});
