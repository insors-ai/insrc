/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * E202609309b72686c:S001 — the pre-render companion-validation GATE.
 *
 * A HIGH companion-validation finding (a malformed authored er / ux / sequence /
 * component-dependency definition) is now SURFACED as a retryable schema
 * FinalizeResult failure — the client-driven synthesize phase re-prompts the
 * author — instead of the finalize render helpers silently swallowing it and
 * writing a document that references a companion that never rendered (k1). The
 * author's definition is never machine-rewritten (k2); only HIGH gates (MED/LOW
 * do not); and the docgen-infra DiagramGenerationError swallow inside each render
 * helper is unchanged (an infra failure is not an author error — that swallow is
 * covered at the helper level by companion/__tests__/render.test.ts +
 * ux-render.test.ts, which stub a non-ok DocGenOutcome).
 *
 * Two levels:
 *   - unit: firstCompanionValidationFailure over each authored kind (exported seam).
 *   - integration: finalizeArtifact (standalone-LLD + design.epic finalizers) proves
 *     the surface + no-partial-write + retryable propagation + no-regression.
 *
 * Run: npx tsx --test --test-force-exit src/workflow/__tests__/companion-validation-gate.test.ts
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, existsSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

import { finalizeArtifact, firstCompanionValidationFailure } from '../orchestrator.js';
import { approveArtifactByJsonPath } from '../gates.js';
import { defineArtifactPaths } from '../storage.js';
import type { WorkflowIntent } from '../types.js';
import type { LldArtifact } from '../artifacts/lld.js';

const EPIC_HASH = 'c0ffee1234abcd56';
const CREATED   = '2026-09-30T00:00:00.000Z';

// ── Fixtures (drawn verbatim from the companion validator unit tests) ──────────

/** Valid: Customer 1—* Order, both identified. */
const validEr = {
	classes: {
		Customer: { attributes: { id: { range: 'string', identifier: true }, name: { range: 'string' } } },
		Order:    { attributes: { id: { range: 'string', identifier: true }, customer: { range: 'Customer', required: true } } },
	},
} as const;
/** HIGH: `customer` ranges on the undefined class `Customer` → dangling relationship. */
const erDangling = { classes: { Order: { attributes: {
	id:       { range: 'string', identifier: true },
	customer: { range: 'Customer' },
} } } } as const;
/** LOW-only: a class with no identifier is a LOW observation, never a HIGH. */
const erNoId = { classes: { Loose: { attributes: { text: { range: 'string' } } } } } as const;

/** Valid single-element card. */
const validUx = { type: 'AdaptiveCard', body: [{ type: 'TextBlock', text: 'hi' }] } as const;
/** HIGH: a TextBlock without its required `text` → Adaptive Cards violation. */
const uxBad = { type: 'AdaptiveCard', body: [{ type: 'TextBlock' }] } as const;

/** Valid sequence. */
const validSeq = {
	participants: [{ id: 'A', label: 'Client' }, { id: 'B', label: 'Server' }],
	messages: [{ from: 'A', to: 'B', label: 'request' }],
} as const;
/** HIGH: message endpoint `Z` is not a declared participant → dangling. */
const seqBad = { participants: [{ id: 'A' }], messages: [{ from: 'A', to: 'Z', label: 'x' }] } as const;

/** Valid component graph. */
const validComp = { components: [{ id: 'api' }, { id: 'db' }], dependencies: [{ from: 'api', to: 'db' }] } as const;
/** HIGH: dependency to the undeclared component `zzz` → dangling. */
const compBad = { components: [{ id: 'api' }], dependencies: [{ from: 'api', to: 'zzz' }] } as const;

// ---------------------------------------------------------------------------
// unit — firstCompanionValidationFailure over each authored kind (ac1, ac3)
// ---------------------------------------------------------------------------

test('gate: a HIGH-invalid definition of EACH kind → a retryable schema failure with details (ac1, lc1)', () => {
	for (const [slot, body] of [
		['erDefinition',                  { erDefinition: erDangling }],
		['uxDefinition',                  { uxDefinition: uxBad }],
		['sequenceDefinition',            { sequenceDefinition: seqBad }],
		['componentDependencyDefinition', { componentDependencyDefinition: compBad }],
	] as const) {
		const failure = firstCompanionValidationFailure(body);
		assert.ok(failure !== undefined, `${slot}: a HIGH finding must produce a failure`);
		assert.equal(failure.ok, false);
		if (failure.ok) continue;
		assert.equal(failure.kind, 'schema', `${slot}: schema-kind`);
		assert.equal(failure.retryable, true, `${slot}: retryable`);
		assert.ok((failure.details ?? []).length > 0, `${slot}: carries the specific error messages`);
		assert.ok((failure.details ?? []).every(d => d.startsWith(`${slot}:`)), `${slot}: details are tagged by slot`);
	}
});

test('gate: a valid / MED-LOW-only / no-companion body → undefined (ac3, no regression)', () => {
	assert.equal(firstCompanionValidationFailure({ erDefinition: validEr }), undefined, 'valid ER');
	assert.equal(firstCompanionValidationFailure({ uxDefinition: validUx }), undefined, 'valid UX');
	assert.equal(firstCompanionValidationFailure({ sequenceDefinition: validSeq }), undefined, 'valid sequence');
	assert.equal(firstCompanionValidationFailure({ componentDependencyDefinition: validComp }), undefined, 'valid component');
	assert.equal(firstCompanionValidationFailure({ erDefinition: erNoId }), undefined, 'a LOW-only finding does not gate');
	assert.equal(firstCompanionValidationFailure({}), undefined, 'no authored definition → undefined');
});

test('gate: the author definition object is not mutated (k2 / ac4)', () => {
	const before = JSON.stringify(uxBad);
	firstCompanionValidationFailure({ uxDefinition: uxBad });
	assert.equal(JSON.stringify(uxBad), before, 'the gate only reads the definition; it never rewrites it');
});

// ---------------------------------------------------------------------------
// integration — the standalone-LLD finalizer (surface + no-partial-write)
// ---------------------------------------------------------------------------

function minimalLldBody(): Record<string, unknown> {
	return {
		hldContextSlice: { frameworkSummary: 'standalone', ownedContracts: [], consumedContracts: [], boundary: { storyId: 'S001', owns: [], depends: [], internal: 'x' }, adjacentBoundaries: [], rolloutPhase: 'standalone', nonFunctional: {} },
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
function standaloneLldIntent(repo: string): WorkflowIntent {
	return {
		workflow: 'design.story', focus: 'a standalone feature', repoPath: repo, repoIndexedAt: null,
		params: { standalone: true, epicHash: EPIC_HASH, storyId: 'S001', sizeClass: 'feature' },
	} as unknown as WorkflowIntent;
}
const citations = [{ id: 'c1', kind: 'code', ref: 'src/x.ts' }];

test('finalize[standalone-LLD]: a HIGH-invalid uxDefinition → retryable schema failure + NO artifact written (ac1)', async () => {
	const repo = mkdtempSync(join(tmpdir(), 'gate-lld-fail-'));
	try {
		const emit = { body: { ...minimalLldBody(), uxDefinition: uxBad }, citations };
		const result = await finalizeArtifact(standaloneLldIntent(repo), {}, 'wf-gate-fail', 5, emit, 'client');
		assert.equal(result.ok, false, 'finalize surfaces the HIGH finding');
		if (result.ok) return;
		assert.equal(result.failure.ok, false);
		if (result.failure.ok) return;
		assert.equal(result.failure.kind, 'schema');
		assert.equal(result.failure.retryable, true);
		assert.ok((result.failure.details ?? []).some(d => /uxDefinition/.test(d)));
		// No partial write: finalize returns the failure to the driver; the daemon
		// writer never runs, so no ux-mock.html sibling was produced.
		assert.ok(!existsSync(join(repo, 'ux-mock.html')), 'no companion file was written on the failure path');
	} finally { rmSync(repo, { recursive: true, force: true }); }
});

test('finalize[standalone-LLD]: the corrected (valid) uxDefinition → {ok:true}, companion rendered + linked (ac2, ac4)', async () => {
	const repo = mkdtempSync(join(tmpdir(), 'gate-lld-ok-'));
	try {
		const emit = { body: { ...minimalLldBody(), uxDefinition: validUx }, citations };
		const result = await finalizeArtifact(standaloneLldIntent(repo), {}, 'wf-gate-ok', 5, emit, 'client');
		assert.equal(result.ok, true, 'a valid definition passes the gate and renders as today');
		if (!result.ok) return;
		const artifact = result.finalized.artifact as LldArtifact;
		assert.equal(artifact.body.companions?.length, 1);
		assert.match(artifact.body.companions![0]!.relPath, /ux-mock\.html$/);
		assert.ok(existsSync(join(repo, artifact.body.companions![0]!.relPath)));
		// ac4: the author's definition is carried through unchanged.
		assert.deepEqual(artifact.body.uxDefinition, validUx);
	} finally { rmSync(repo, { recursive: true, force: true }); }
});

test('finalize[standalone-LLD]: NO companion definitions → {ok:true}, no companion (byte-identical, ac3)', async () => {
	const repo = mkdtempSync(join(tmpdir(), 'gate-lld-none-'));
	try {
		const result = await finalizeArtifact(standaloneLldIntent(repo), {}, 'wf-gate-none', 5, { body: minimalLldBody(), citations }, 'client');
		assert.equal(result.ok, true);
		if (!result.ok) return;
		assert.equal((result.finalized.artifact as LldArtifact).body.companions, undefined);
	} finally { rmSync(repo, { recursive: true, force: true }); }
});

// ---------------------------------------------------------------------------
// integration — the design.epic (HLD) finalizer (same gate, second site)
// ---------------------------------------------------------------------------

function seedOneStoryEpic(repo: string): void {
	const dp = defineArtifactPaths(repo, EPIC_HASH, CREATED, 'epic', 'gate-epic');
	mkdirSync(dirname(dp.json), { recursive: true });
	writeFileSync(dp.json, JSON.stringify({
		meta: { workflow: 'define', runId: 'def-gate', schemaVersion: 1, epicHash: EPIC_HASH, epicSlug: 'gate-epic', createdAt: CREATED },
		body: {
			flavor: 'new-capability', problem: 'x', nonGoals: [], assumptions: [], constraints: [],
			stories: [{ id: 's1', title: 'The story', userValue: 'v', acceptanceCriteria: [], dependsOn: [] }],
			openQuestions: [],
		},
		citations: [],
	}, null, 2));
	approveArtifactByJsonPath(dp.json);
}
function validHldBody(extra: Record<string, unknown>): Record<string, unknown> {
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
		...extra,
	};
}
function epicIntent(repo: string): WorkflowIntent {
	return {
		workflow: 'design.epic', focus: 'HLD for the epic', repoPath: repo, repoIndexedAt: null,
		params: { epicHash: EPIC_HASH },
	} as unknown as WorkflowIntent;
}

test('finalize[design.epic]: a HIGH-invalid sequenceDefinition → retryable schema failure (second finalizer site)', async () => {
	const repo = mkdtempSync(join(tmpdir(), 'gate-hld-fail-'));
	try {
		seedOneStoryEpic(repo);
		const emit = { body: validHldBody({ sequenceDefinition: seqBad }), citations: [{ id: 'c1', kind: 'analyze-bundle', ref: 'x' }] };
		const result = await finalizeArtifact(epicIntent(repo), {}, 'wf-hld-fail', 5, emit, 'client');
		assert.equal(result.ok, false);
		if (result.ok) return;
		assert.equal(result.failure.ok, false);
		if (result.failure.ok) return;
		assert.equal(result.failure.kind, 'schema');
		assert.equal(result.failure.retryable, true);
		assert.ok((result.failure.details ?? []).some(d => /sequenceDefinition/.test(d)));
	} finally { rmSync(repo, { recursive: true, force: true }); }
});

test('finalize[design.epic]: a valid erDefinition → {ok:true} with the companion rendered (no regression)', async () => {
	const repo = mkdtempSync(join(tmpdir(), 'gate-hld-ok-'));
	try {
		seedOneStoryEpic(repo);
		const emit = { body: validHldBody({ erDefinition: validEr }), citations: [{ id: 'c1', kind: 'analyze-bundle', ref: 'x' }] };
		const result = await finalizeArtifact(epicIntent(repo), {}, 'wf-hld-ok', 5, emit, 'client');
		assert.equal(result.ok, true);
		if (!result.ok) return;
		const companions = (result.finalized.artifact as { body: { companions?: readonly { relPath: string }[] } }).body.companions;
		assert.equal(companions?.length, 1);
		assert.match(companions![0]!.relPath, /er-model\.html$/);
		assert.ok(existsSync(join(repo, companions![0]!.relPath)));
	} finally { rmSync(repo, { recursive: true, force: true }); }
});
