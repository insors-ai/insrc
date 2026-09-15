/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * S001 scope-awareness gate — the LLM-judged `sbdry5` half.
 *
 * Behavioural: drive `finalizeArtifact` for a `design.story` run whose s8 audit
 * marks `sbdry5` (adjacent-scope over-reach) missed, and prove it hard-fails as a
 * non-retryable boundary failure via the orchestrator boundaryIds set. The s8
 * boundary check runs BEFORE the standalone / epic branch, so a standalone intent
 * exercises the set without needing an Epic + HLD on disk.
 *
 * Structural locks: the `sbdry5` addition is scoped to the `design.story` s8 set
 * only — the `design.epic` s6 set stays `sbdry1-4` — and the anti-overreach rule
 * is wired into both runner prompt sets.
 *
 * Run:
 *   npx tsx --test src/workflow/__tests__/adjacent-scope-gate.test.ts
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

import { finalizeArtifact } from '../orchestrator.js';
import { approveArtifactByJsonPath } from '../gates.js';
import { computeHldEffectiveHash } from '../artifacts/lld.js';
import { defineArtifactPaths, hldArtifactPaths } from '../storage.js';
import { ANTI_OVERREACH_RULE } from '../runners/scope-prompts.js';
import type { LldBody } from '../artifacts/lld.js';
import type { WorkflowIntent } from '../types.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const SRC  = join(HERE, '..');

// A minimal LldBody that passes isLldBody so finalize reaches the s8 check.
function minimalLldBody(): LldBody {
	return {
		hldContextSlice: {
			frameworkSummary: 'standalone',
			ownedContracts: [],
			consumedContracts: [],
			boundary: { storyId: 'S001', owns: [], depends: [], internal: 'x' },
			adjacentBoundaries: [],
			rolloutPhase: 'standalone',
			nonFunctional: {},
		},
		contractDetails: {
			surfaceLevel: 'internal',
			api: [{
				name: 'foo', signature: 'foo(x: string): void',
				parameters: [{ name: 'x', type: 'string', purpose: 'p', optional: false }],
				returns: { type: 'void', meaning: 'm' }, errors: [], preconditions: [], postconditions: [],
			}],
		},
		dataModelChanges: [],
		interactionWithShared: [],
		errorPaths: { errorCases: [], edgeCases: [], invariantsToPreserve: [] },
		testStrategy: {
			testLevels: [{ level: 'unit', purpose: 'p', subjects: ['foo'] }],
			acceptanceMapping: [], testFramework: 'node:test',
		},
		alternativesConsidered: [{ id: 'a1', name: 'n', oneLineSummary: 'x', approach: 'x', pros: ['x'], cons: ['x'], costEstimate: 'S' }],
		chosenAlternative: 'a1',
		openQuestions: [],
	};
}

function storyIntent(): WorkflowIntent {
	return {
		workflow: 'design.story',
		repoPath: '/tmp/does-not-matter',
		focus: 'scope-awareness gate test',
		params: { standalone: true, storyId: 'S001' },
	} as unknown as WorkflowIntent;
}

function synthEmit(): Record<string, unknown> {
	return { body: minimalLldBody(), citations: [{ id: 'c1', kind: 'analyze-bundle', ref: 'x' }] };
}

function finalizeWithS8(results: Array<{ itemId: string; verdict: string; evidence: string }>): ReturnType<typeof finalizeArtifact> {
	return finalizeArtifact(storyIntent(), { s8: { results } }, 'wf-scope-run', 5, synthEmit(), 'client');
}

// ---------------------------------------------------------------------------
// Behavioural — sbdry5 hard-fail
// ---------------------------------------------------------------------------

test('design.story: a missed sbdry5 verdict is a non-retryable boundary hard-fail', () => {
	const result = finalizeWithS8([{ itemId: 'sbdry5', verdict: 'missed', evidence: 'implements a sibling contract' }]);
	assert.equal(result.ok, false);
	if (result.ok) return;
	assert.equal(result.failure.ok, false);
	if (result.failure.ok) return;
	assert.equal(result.failure.kind, 'boundary');
	assert.equal(result.failure.retryable, false);
	assert.match(result.failure.message, /sbdry5/);
});

test('design.story: sbdry1-4 still hard-fail (regression — set was extended, not replaced)', () => {
	for (const id of ['sbdry1', 'sbdry2', 'sbdry3', 'sbdry4']) {
		const result = finalizeWithS8([{ itemId: id, verdict: 'missed', evidence: 'x' }]);
		assert.equal(result.ok, false, `${id} should hard-fail`);
		if (result.ok) continue;
		if (result.failure.ok) continue;
		assert.equal(result.failure.kind, 'boundary', `${id} is a boundary failure`);
		assert.match(result.failure.message, new RegExp(id));
	}
});

test('design.story: a PASSED sbdry5 does not trigger the boundary hard-fail', () => {
	// sbdry5 present but passed → the s8 boundary gate must NOT fire. The verdict
	// gates the hard-fail: only missed/ambiguous do. Asserted UNCONDITIONALLY —
	// the result is either ok or a non-boundary failure (this standalone fixture
	// currently surfaces a later schema failure, which is fine; what must never
	// happen is a boundary hard-fail on a passed sbdry5).
	const result = finalizeWithS8([{ itemId: 'sbdry5', verdict: 'passed', evidence: 'stays in scope' }]);
	const isBoundaryFail = !result.ok && !result.failure.ok && result.failure.kind === 'boundary';
	assert.equal(isBoundaryFail, false, 'a passed sbdry5 must not be a boundary hard-fail');
	// Contrast control: the SAME harness with sbdry5 MISSED *is* a boundary fail,
	// proving the difference is the verdict, not the fixture.
	const missed = finalizeWithS8([{ itemId: 'sbdry5', verdict: 'missed', evidence: 'x' }]);
	assert.ok(!missed.ok && !missed.failure.ok && missed.failure.kind === 'boundary', 'missed sbdry5 IS a boundary fail (control)');
});

// ---------------------------------------------------------------------------
// Structural locks — scoping of the sbdry5 addition + rule propagation
// ---------------------------------------------------------------------------

test('sbdry5 is added to exactly ONE orchestrator boundaryIds set (the design.story s8 set)', () => {
	const src = readFileSync(join(SRC, 'orchestrator.ts'), 'utf8');
	// The design.story s8 set carries sbdry5.
	assert.ok(src.includes("new Set(['sbdry1', 'sbdry2', 'sbdry3', 'sbdry4', 'sbdry5'])"), 'design.story s8 set includes sbdry5');
	// The design.epic s6 set is UNTOUCHED — still sbdry1-4.
	assert.ok(src.includes("new Set(['sbdry1', 'sbdry2', 'sbdry3', 'sbdry4'])"), 'design.epic s6 set stays sbdry1-4');
	// sbdry5 appears in exactly one Set literal — it did not leak into the epic set.
	const withSbdry5 = (src.match(/new Set\(\['sbdry1', 'sbdry2', 'sbdry3', 'sbdry4', 'sbdry5'\]\)/g) ?? []).length;
	assert.equal(withSbdry5, 1, 'sbdry5 is wired into exactly one boundaryIds set');
});

test('the anti-overreach rule is wired into both the design.story and plan runners', () => {
	const ds = readFileSync(join(SRC, 'runners/design-story/index.ts'), 'utf8');
	const pl = readFileSync(join(SRC, 'runners/plan/index.ts'), 'utf8');
	assert.ok(ds.includes('ANTI_OVERREACH_RULE'), 'design.story runner references the shared rule');
	assert.ok(pl.includes('ANTI_OVERREACH_RULE'), 'plan runner references the shared rule');
	// The rule is used at the five design.story sites + imported once (>=6 refs total in design-story).
	const dsRefs = (ds.match(/ANTI_OVERREACH_RULE/g) ?? []).length;
	assert.ok(dsRefs >= 6, `design.story references the rule at all five sites + import (got ${dsRefs})`);
	// checklist.verify enumerates sbdry5.
	assert.ok(ds.includes('sbdry5:'), 'checklist.verify lists the sbdry5 item');
	assert.ok(ds.includes('sbdry5'), 'checklist hard-fail line references sbdry5');
});

test('ANTI_OVERREACH_RULE names adjacentBoundaries + consume-not-redesign + flag-not-silent', () => {
	assert.match(ANTI_OVERREACH_RULE, /adjacentBoundaries/);
	assert.match(ANTI_OVERREACH_RULE, /CONSUME/);
	assert.match(ANTI_OVERREACH_RULE, /openQuestion|back-flow/);
});

// ---------------------------------------------------------------------------
// Behavioural — the DETERMINISTIC guard on the epic-parented finalize path
// (findAdjacentScopeViolations → boundaryHardFailure). Needs an approved
// Epic + HLD on disk (two stories, s1 owns sc1). Drives finalize as s2's LLD.
// ---------------------------------------------------------------------------

const EPIC_HASH = 'a3f4b8c9d1e2f3a4';
const HLD_RUN   = 'hld-run-adj';

function seedTwoStoryEpic(repo: string): void {
	const dp = defineArtifactPaths(repo, EPIC_HASH);
	mkdirSync(dirname(dp.json), { recursive: true });
	writeFileSync(dp.json, JSON.stringify({
		meta: { workflow: 'define', runId: 'def-adj', schemaVersion: 1, epicHash: EPIC_HASH, epicSlug: 'adj' },
		body: {
			flavor: 'new-capability', problem: 'x', nonGoals: [], assumptions: [], constraints: [],
			stories: [
				{ id: 's1', title: 'Owns sc1', userValue: 'v', acceptanceCriteria: [], dependsOn: [] },
				{ id: 's2', title: 'Consumer',  userValue: 'v', acceptanceCriteria: [], dependsOn: [] },
			],
			openQuestions: [],
		},
		citations: [],
	}, null, 2));
	approveArtifactByJsonPath(dp.json);

	const hp = hldArtifactPaths(repo, EPIC_HASH);
	writeFileSync(hp.json, JSON.stringify({
		meta: { workflow: 'design.epic', runId: HLD_RUN, schemaVersion: 1, epicHash: EPIC_HASH, epicSlug: 'adj' },
		body: {
			frameworkSummary: 'x', architectureShape: 'x [[c1]]',
			sharedContracts: [{ id: 'sc1', name: 'A', purpose: 'p', interfaceSketch: 'interface A {}', ownedByStory: 's1', consumedByStories: ['s2'], assumptions: [] }],
			storyBoundaries: [
				{ storyId: 's1', owns: ['sc1'], depends: [], internal: 's1 owns sc1' },
				{ storyId: 's2', owns: [], depends: ['sc1'], internal: 's2 consumes sc1' },
			],
			nonFunctional: {},
			rolloutOverview: { phases: [{ name: 'A', includesStories: ['s1', 's2'], rationale: 'x', backwardCompat: '', featureFlag: null }], orderingRationale: 'x', riskyBits: [] },
			alternativesConsidered: [{ id: 'a1', name: 'x', oneLineSummary: 'x', approach: 'x', pros: ['x'], cons: ['x'], costEstimate: 'S' }],
			chosenAlternative: 'a1', openQuestions: [],
		},
		citations: [{ id: 'c1', kind: 'analyze-bundle', ref: 'x' }],
	}, null, 2));
	approveArtifactByJsonPath(hp.json);
}

function epicStoryIntent(repo: string, storyId: string): WorkflowIntent {
	return {
		workflow: 'design.story', repoPath: repo, focus: 'adjacent guard test',
		params: { epicHash: EPIC_HASH, storyId }, repoIndexedAt: null,
	} as unknown as WorkflowIntent;
}

// s2's LLD that IMPLEMENTS sc1 (owned by the adjacent story s1) → collision.
function s2BodyImplementingS1Contract(): LldBody {
	const b = minimalLldBody();
	return { ...b, interactionWithShared: [{ contractId: 'sc1', role: 'implements', howDetails: 'over-reach' }] };
}

test('epic-parented design.story: implementing a sibling-owned contract is a deterministic boundary hard-fail', () => {
	const repo = mkdtempSync(join(tmpdir(), 'insrc-adj-guard-'));
	try {
		seedTwoStoryEpic(repo);
		const emit = { body: s2BodyImplementingS1Contract(), citations: [{ id: 'c1', kind: 'analyze-bundle', ref: 'x' }] };
		const result = finalizeArtifact(epicStoryIntent(repo, 's2'), {}, 'wf-adj-run', 5, emit, 'client');
		assert.equal(result.ok, false);
		if (result.ok) return;
		assert.equal(result.failure.ok, false);
		if (result.failure.ok) return;
		assert.equal(result.failure.kind, 'boundary');
		assert.equal(result.failure.retryable, false);
		assert.match(result.failure.message, /adjacent-scope/);
		// The finding names the colliding contract + owning sibling.
		assert.ok(result.failure.findings?.some(f => f.itemId === 'sbdry5' && /sc1/.test(f.detail) && /s1/.test(f.detail)));
	} finally { rmSync(repo, { recursive: true, force: true }); }
});

test('epic-parented design.story: CONSUMING a sibling-owned contract is not an adjacent-scope boundary fail', () => {
	const repo = mkdtempSync(join(tmpdir(), 'insrc-adj-guard-ok-'));
	try {
		seedTwoStoryEpic(repo);
		const body = { ...minimalLldBody(), interactionWithShared: [{ contractId: 'sc1', role: 'consumes', howDetails: 'legit' }] };
		const emit = { body, citations: [{ id: 'c1', kind: 'analyze-bundle', ref: 'x' }] };
		const result = finalizeArtifact(epicStoryIntent(repo, 's2'), {}, 'wf-adj-run', 5, emit, 'client');
		// It may still fail later cross-artifact checks, but NEVER as an adjacent-scope boundary hard-fail.
		if (!result.ok && !result.failure.ok) {
			const isAdjacentBoundaryFail = result.failure.kind === 'boundary' && /adjacent-scope/.test(result.failure.message);
			assert.equal(isAdjacentBoundaryFail, false, 'a legitimate consume must not trip the adjacent-scope guard');
		}
	} finally { rmSync(repo, { recursive: true, force: true }); }
});
