/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * S006 (Epic frame-epic-new-pre-workflow-brainstorm, sc1) — the durable,
 * inspectable SpecArtifact: record family + renderer + storage paths, plus the
 * orchestrator wiring that turns a converged `elicit` output into exactly one
 * persisted SpecArtifact.
 *
 * Run:
 *   npx tsx --test src/workflow/__tests__/spec-artifact.test.ts
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
	isSpecBody,
	renderSpecMarkdown,
	SPEC_SCHEMA_VERSION,
	type SpecArtifact,
	type SpecArtifactBody,
} from '../artifacts/spec.js';
import {
	prepareSynthesize,
	finalizeArtifact,
} from '../orchestrator.js';
import {
	SPECS_DIR,
	specArtifactId,
	specArtifactPaths,
	specMdRel,
	writeAtomic,
} from '../storage.js';
import type { WorkflowIntent } from '../types.js';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function specBody(overrides: Partial<SpecArtifactBody> = {}): SpecArtifactBody {
	return {
		category:      'requirements',
		intent:        'Add a pre-workflow brainstorm stage that converges a rough idea into a spec.',
		scopeBoundary: 'Only the elicitation + persistence; downstream define/design.story consumption is separate.',
		nonGoals:      ['autonomous daemon loop', 'multi-user shared sessions'],
		decisions:     [
			{ chosen: 'controller-driven elicitation', ruledOut: ['autonomous daemon loop'], reason: 'keeps the human in the loop (k2).' },
		],
		openItems:     [],
		...overrides,
	};
}

function specArtifact(overrides: Partial<SpecArtifactBody> = {}): SpecArtifact {
	return {
		meta: {
			workflow:      'brainstorm',
			runId:         'wf-spec-1',
			repoPath:      '/tmp/repo',
			createdAt:     '2026-08-02T00:00:00.000Z',
			elapsedMs:     42,
			repoIndexedAt: null,
			schemaVersion: SPEC_SCHEMA_VERSION,
			specHash:      'abcd1234ef567890',
			epicSlug:      'brainstorm-stage',
		},
		body:      specBody(overrides),
		citations: [{ id: 'c1', kind: 'step-output', ref: 's1' }],
	};
}

function brainstormIntent(): WorkflowIntent {
	return {
		workflow: 'brainstorm', focus: 'a pre-workflow brainstorm stage', repoPath: '/tmp/repo',
		repoIndexedAt: null, params: {},
	};
}

/** A confirmed, converged `elicit` s1 output (what the runner resumes with). */
function convergedS1(overrides: Record<string, unknown> = {}): Record<string, unknown> {
	return {
		s1: {
			category:         'requirements',
			workingStatement: 'Add a pre-workflow brainstorm stage that converges a rough idea into a spec, stopping at persistence.',
			openItems:        [],
			confirmed:        true,
			decisions:        [
				{ chosen: 'controller-driven elicitation', ruledOut: ['autonomous daemon loop'], reason: 'human stays in the loop.' },
			],
			nonGoals:         ['autonomous daemon loop'],
			...overrides,
		},
	};
}

/** The artifact the synthesize turn emits (SpecArtifactBody + citations). */
function synthEmit(bodyOverrides: Partial<SpecArtifactBody> = {}): Record<string, unknown> {
	return {
		body: specBody(bodyOverrides),
		citations: [{ id: 'c1', kind: 'step-output', ref: 's1' }],
	};
}

// ---------------------------------------------------------------------------
// Renderer + field-set unit
// ---------------------------------------------------------------------------

test('renderSpecMarkdown: emits the id-marker header + one section per body field', () => {
	const md = renderSpecMarkdown(specArtifact());
	assert.match(md, /<!-- insrc:artifact SPEC-abcd1234ef567890 -->/, 'artifact-id marker header maps md → json');
	assert.match(md, /\*\*Category:\*\* requirements/);
	assert.match(md, /## Intent/);
	assert.match(md, /## Scope boundary/);
	assert.match(md, /## Non-goals/);
	assert.match(md, /## Decisions/);
	// Each decision renders chosen + reason + its ruled-out alternatives.
	assert.match(md, /\*\*controller-driven elicitation\*\* — keeps the human in the loop/);
	assert.match(md, /Ruled out: _autonomous daemon loop_/);
});

test('renderSpecMarkdown: an empty openItems list omits the Open items section (confirmed spec)', () => {
	const md = renderSpecMarkdown(specArtifact({ openItems: [] }));
	assert.doesNotMatch(md, /## Open items/);
	const withOpen = renderSpecMarkdown(specArtifact({ openItems: ['budget for the daemon loop?'] }));
	assert.match(withOpen, /## Open items/);
	assert.match(withOpen, /- budget for the daemon loop\?/);
});

test('isSpecBody: accepts a well-formed body, rejects under-structured ones', () => {
	assert.equal(isSpecBody(specBody()), true);
	assert.equal(isSpecBody(specBody({ scopeBoundary: '' })), false, 'empty scopeBoundary is under-structured');
	assert.equal(isSpecBody(specBody({ intent: '' })), false, 'empty intent is under-structured');
	assert.equal(isSpecBody({ ...specBody(), category: 'nonsense' }), false, 'category outside the vocabulary');
	assert.equal(isSpecBody({ ...specBody(), nonGoals: 'not-an-array' }), false);
	assert.equal(isSpecBody({ ...specBody(), decisions: [{ chosen: 'x', reason: 'y' }] }), false, 'decision missing ruledOut');
	assert.equal(isSpecBody(null), false);
});

// ---------------------------------------------------------------------------
// Storage paths
// ---------------------------------------------------------------------------

test('specArtifactId / specArtifactPaths: hash-named json, slug-named md under docs/specs', () => {
	assert.equal(specArtifactId('abcd1234ef567890'), 'SPEC-abcd1234ef567890');
	const paths = specArtifactPaths('/tmp/repo', 'abcd1234ef567890', 'brainstorm-stage');
	assert.equal(paths.json, '/tmp/repo/.insrc/artifacts/SPEC-abcd1234ef567890.json');
	assert.equal(paths.md,   '/tmp/repo/docs/specs/SPEC-brainstorm-stage.md');
	// No slug → md falls back to the hash.
	const noSlug = specArtifactPaths('/tmp/repo', 'abcd1234ef567890');
	assert.equal(noSlug.md, '/tmp/repo/docs/specs/SPEC-abcd1234ef567890.md');
	assert.equal(specMdRel('brainstorm-stage'), `${SPECS_DIR}/SPEC-brainstorm-stage.md`);
});

test('writeAtomic round-trip: SpecArtifact json is deep-equal + idempotent', () => {
	const dir = mkdtempSync(join(tmpdir(), 'insrc-spec-'));
	try {
		const artifact = specArtifact();
		const paths = specArtifactPaths(dir, artifact.meta.specHash!, artifact.meta.epicSlug);
		const json = JSON.stringify(artifact, null, 2) + '\n';
		writeAtomic(paths.json, json);
		const first = JSON.parse(readFileSync(paths.json, 'utf8'));
		assert.deepEqual(first, artifact);
		// Idempotent: a second write of the same content leaves an identical file.
		writeAtomic(paths.json, json);
		assert.equal(readFileSync(paths.json, 'utf8'), json);
	} finally {
		rmSync(dir, { recursive: true, force: true });
	}
});

// ---------------------------------------------------------------------------
// Orchestrator wiring — brainstorm synth/finalize no longer throw
// ---------------------------------------------------------------------------

test('prepareSynthesize: brainstorm is supported (no "not yet supported" throw) and grounds on s1', () => {
	const prompt = prepareSynthesize(brainstormIntent(), convergedS1());
	assert.match(prompt.systemPrompt, /SpecArtifact/);
	assert.match(prompt.systemPrompt, /workingStatement/);
	assert.equal(typeof prompt.schema, 'object');
});

test('finalizeArtifact[brainstorm]: converged output → exactly one SpecArtifact, approvedAt unset', () => {
	const result = finalizeArtifact(brainstormIntent(), convergedS1(), 'wf-spec-run', 5, synthEmit(), 'client');
	assert.equal(result.ok, true);
	if (!result.ok) return;
	assert.equal(result.finalized.workflow, 'brainstorm');
	const artifact = result.finalized.artifact as SpecArtifact;
	assert.equal(artifact.meta.workflow, 'brainstorm');
	assert.ok(/^[0-9a-f]{16}$/.test(artifact.meta.specHash ?? ''), 'mints its own run-derived specHash');
	assert.equal(artifact.meta.epicHash, undefined, 'a spec is NOT Epic-scoped');
	assert.equal(artifact.meta.approvedAt, undefined, 'unapproved until the user gate');
	// The whole body survives: intent + scopeBoundary + nonGoals + decisions + openItems.
	assert.ok(artifact.body.intent.length > 0);
	assert.ok(artifact.body.scopeBoundary.length > 0);
	assert.deepEqual(artifact.body.nonGoals, ['autonomous daemon loop', 'multi-user shared sessions']);
	assert.equal(artifact.body.decisions.length, 1);
	assert.deepEqual(artifact.body.openItems, []);
	assert.match(result.finalized.renderedMd, /## Intent/);
});

test('finalizeArtifact[brainstorm]: rejects an under-structured body (empty scopeBoundary), writes nothing', () => {
	const result = finalizeArtifact(
		brainstormIntent(), convergedS1(), 'wf-spec-run', 5,
		synthEmit({ scopeBoundary: '' }), 'client',
	);
	assert.equal(result.ok, false);
	if (result.ok) return;
	assert.equal(result.failure.ok, false);
	if (result.failure.ok) return;
	assert.equal(result.failure.kind, 'schema');
});

test('finalizeArtifact[brainstorm]: rejects a ruled-out direction missing from nonGoals', () => {
	const result = finalizeArtifact(
		brainstormIntent(), convergedS1(), 'wf-spec-run', 5,
		// The decision rules out a direction that is NOT in nonGoals → dropped from the record.
		synthEmit({ nonGoals: ['multi-user shared sessions'] }),
		'client',
	);
	assert.equal(result.ok, false);
	if (result.ok) return;
	assert.equal(result.failure.ok, false);
	if (result.failure.ok) return;
	assert.equal(result.failure.kind, 'schema');
	assert.match(result.failure.message, /ruled-out/i);
});
