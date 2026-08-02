/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * S008 (Epic frame-epic-new-pre-workflow-brainstorm, sc4) — seed a define run
 * from an approved spec: the resolveStageFocus/composeSpecFocus helper + the
 * finalizeDefine provenance stamp (meta.seededFromSpec) surfaced in the DEF md.
 *
 * Run:
 *   npx tsx --test src/workflow/__tests__/seed-focus.test.ts
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { composeSpecFocus, resolveStageFocus } from '../seed-focus.js';
import { SpecNotApprovedError, SpecArtifactNotFoundError, approveArtifactByJsonPath } from '../gates.js';
import { renderSpecMarkdown, SPEC_SCHEMA_VERSION, type SpecArtifact } from '../artifacts/spec.js';
import { renderDefineMarkdown, type DefineArtifact, type DefineBody } from '../artifacts/define.js';
import { finalizeArtifact } from '../orchestrator.js';
import { specArtifactPaths, writeAtomic } from '../storage.js';
import type { WorkflowIntent } from '../types.js';

const SPEC_HASH = 'abcd1234ef567890';

function specArtifact(approved: boolean): SpecArtifact {
	return {
		meta: {
			workflow:      'brainstorm',
			runId:         'wf-seed-1',
			repoPath:      '/tmp/repo',
			createdAt:     '2026-08-02T00:00:00.000Z',
			elapsedMs:     10,
			repoIndexedAt: null,
			schemaVersion: SPEC_SCHEMA_VERSION,
			specHash:      SPEC_HASH,
			epicSlug:      'brainstorm-stage',
			...(approved ? { approvedAt: '2026-08-02T01:00:00.000Z' } : {}),
		},
		body: {
			category:      'requirements',
			intent:        'Add a pre-workflow brainstorm stage that converges a rough idea into a spec.',
			scopeBoundary: 'Only elicitation + persistence; downstream consumption is separate.',
			nonGoals:      ['autonomous daemon loop', 'multi-user shared sessions'],
			decisions:     [
				{ chosen: 'controller-driven elicitation', ruledOut: ['autonomous daemon loop'], reason: 'keep the human in the loop.' },
			],
			openItems:     [],
		},
		citations: [{ id: 'c1', kind: 'step-output', ref: 's1' }],
	};
}

function writeSpec(repo: string, artifact: SpecArtifact): { md: string; json: string } {
	const paths = specArtifactPaths(repo, artifact.meta.specHash!, artifact.meta.epicSlug);
	writeAtomic(paths.json, JSON.stringify(artifact, null, 2) + '\n');
	writeAtomic(paths.md, renderSpecMarkdown(artifact));
	return paths;
}

function withRepo(fn: (repo: string) => void): void {
	const repo = mkdtempSync(join(tmpdir(), 'insrc-seed-'));
	try { fn(repo); } finally { rmSync(repo, { recursive: true, force: true }); }
}

// ---------------------------------------------------------------------------
// composeSpecFocus — deterministic + includes every field (ac1/ac2)
// ---------------------------------------------------------------------------

test('composeSpecFocus: includes intent, scope, every non-goal, and every decision; deterministic', () => {
	const spec = specArtifact(true);
	const focus = composeSpecFocus(spec);
	assert.match(focus, /Add a pre-workflow brainstorm stage/);        // intent
	assert.match(focus, /Only elicitation \+ persistence/);            // scope boundary
	for (const ng of spec.body.nonGoals) assert.ok(focus.includes(ng), `non-goal missing: ${ng}`);
	// every decision: chosen + ruledOut + reason all present (ac2)
	assert.match(focus, /controller-driven elicitation/);
	assert.match(focus, /ruled out: autonomous daemon loop/);
	assert.match(focus, /keep the human in the loop/);
	// deterministic
	assert.equal(composeSpecFocus(spec), focus);
});

// ---------------------------------------------------------------------------
// resolveStageFocus — seeded / plain / unapproved / missing
// ---------------------------------------------------------------------------

test('resolveStageFocus: an approved spec seeds the focus + sets seededFromSpec (ac1)', () => {
	withRepo(repo => {
		writeSpec(repo, specArtifact(true));
		const r = resolveStageFocus(repo, 'ignored plain focus', { specHash: SPEC_HASH });
		assert.equal(r.seededFromSpec, SPEC_HASH);
		assert.match(r.focus, /Add a pre-workflow brainstorm stage/);
		assert.notEqual(r.focus, 'ignored plain focus');   // the spec wins
	});
});

test('resolveStageFocus: no specHash is a pure passthrough — focus verbatim, seededFromSpec unset (ac4)', () => {
	withRepo(repo => {
		const r = resolveStageFocus(repo, 'a plain one-line idea', {});
		assert.equal(r.focus, 'a plain one-line idea');
		assert.equal(r.seededFromSpec, undefined);
		// an empty-string specHash is also a passthrough
		const r2 = resolveStageFocus(repo, 'another idea', { specHash: '' });
		assert.equal(r2.focus, 'another idea');
		assert.equal(r2.seededFromSpec, undefined);
	});
});

test('resolveStageFocus: an unapproved spec throws SpecNotApprovedError (never seeds an unapproved spec, k12)', () => {
	withRepo(repo => {
		writeSpec(repo, specArtifact(false));
		assert.throws(() => resolveStageFocus(repo, 'x', { specHash: SPEC_HASH }), SpecNotApprovedError);
	});
});

test('resolveStageFocus: a missing specHash throws SpecArtifactNotFoundError', () => {
	withRepo(repo => {
		assert.throws(() => resolveStageFocus(repo, 'x', { specHash: '0000000000000000' }), SpecArtifactNotFoundError);
	});
});

// ---------------------------------------------------------------------------
// finalizeDefine — provenance stamp (ac3) + absence on a plain-focus run (ac4)
// ---------------------------------------------------------------------------

function defineBody(): DefineBody {
	return {
		flavor:       'new-capability',
		problem:      'Frame the seeded epic from the approved spec so its scope is carried in.',
		nonGoals:     [],
		assumptions:  [],
		constraints:  [],
		stories:      [{
			id: 's1', title: 'Seed the epic', userValue: 'framing carried in',
			acceptanceCriteria: [{ id: 'ac1', given: 'a spec', when: 'framing runs', then: 'it proceeds from the spec', operationalizes: [] }],
		}],
		openQuestions: [],
	};
}

function defineIntent(params: Record<string, unknown>): WorkflowIntent {
	return { workflow: 'define', focus: 'seed epic from spec', repoPath: '/tmp/repo', repoIndexedAt: null, params };
}

test('ac3: finalizeDefine stamps meta.seededFromSpec + renderDefineMarkdown surfaces it when seeded', () => {
	const emit = { body: defineBody(), citations: [{ id: 'c1', kind: 'step-output', ref: 's2' }] };
	const result = finalizeArtifact(defineIntent({ specHash: SPEC_HASH }), {}, 'wf-def-seeded', 5, emit, 'client');
	assert.equal(result.ok, true);
	if (!result.ok) return;
	const artifact = result.finalized.artifact as DefineArtifact;
	assert.equal((artifact.meta as { seededFromSpec?: string }).seededFromSpec, SPEC_HASH);
	assert.match(renderDefineMarkdown(artifact), new RegExp(`Seeded from:.*SPEC-${SPEC_HASH}`));
});

test('ac4: a plain-focus finalizeDefine leaves meta.seededFromSpec unset + no seeded-from header line', () => {
	const emit = { body: defineBody(), citations: [{ id: 'c1', kind: 'step-output', ref: 's2' }] };
	const result = finalizeArtifact(defineIntent({}), {}, 'wf-def-plain', 5, emit, 'client');
	assert.equal(result.ok, true);
	if (!result.ok) return;
	const artifact = result.finalized.artifact as DefineArtifact;
	assert.equal((artifact.meta as { seededFromSpec?: string }).seededFromSpec, undefined);
	assert.doesNotMatch(renderDefineMarkdown(artifact), /Seeded from:/);
});
