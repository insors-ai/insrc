/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * ISSUE-c00559b7 S001/t3 — a work item's head artifact is named from a written
 * title, not from the first words of the stage's prompt.
 *
 * The folder a SPEC, DEF, ISSUE or first standalone LLD lands in used to be
 * derived from the focus, so a focus that opened with a process preamble
 * ("FULLY CONVERGED SPEC ...") named the folder after the preamble. Each head
 * finalizer now labels from its title (or, for a standalone LLD, the Story title
 * triage passes) and falls back to the focus when the title is absent or too
 * short to make a slug.
 *
 * Run:
 *   npx tsx --test src/workflow/__tests__/head-naming.test.ts
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { finalizeArtifact, headLabel, safeDeriveSlug } from '../orchestrator.js';
import type { WorkflowIntent } from '../types.js';

/** The focus every stage below runs with: a preamble, then the subject. */
const FOCUS = 'FULLY CONVERGED SPEC all decisions made: anchor standalone features on their LLD';
const FOCUS_SLUG = safeDeriveSlug(FOCUS);
const TITLE = 'Anchor standalone features on their LLD';
const TITLE_SLUG = 'anchor-standalone-features-their-lld';
/** All stopwords: too short to make a slug, so the focus must answer. */
const DEGENERATE_TITLE = 'the of a';

function intent(workflow: string, params: Record<string, unknown> = {}, repoPath = '/tmp/insrc-head-naming-none'): WorkflowIntent {
	return { workflow, focus: FOCUS, repoPath, repoIndexedAt: null, params } as unknown as WorkflowIntent;
}

function specEmit(title?: string): Record<string, unknown> {
	return {
		body: {
			...(title !== undefined ? { title } : {}),
			category: 'requirements', intent: 'Anchor standalone features on their LLD.', scopeBoundary: 'Resolver and naming only.',
			nonGoals: [], decisions: [], openItems: [],
		},
		citations: [{ id: 'c1', kind: 'step-output', ref: 's1' }],
	};
}

function issueEmit(title: string): Record<string, unknown> {
	return {
		body: { title, reproduction: 'Build a standalone plan task.', rootCause: 'No head artifact.', fixIntent: 'Let the LLD head it.' },
		citations: [{ id: 'c1', kind: 'code', ref: 'src/workflow/tracker/resolve.ts' }],
	};
}

function defineEmit(title?: string): Record<string, unknown> {
	return {
		body: {
			...(title !== undefined ? { title } : {}),
			flavor: 'enhancement',
			problem: 'Standalone features cannot be built task by task because nothing heads them.',
			nonGoals: [], assumptions: [], constraints: [],
			stories: [{
				id: 's1', title: 'Anchor on the LLD', userValue: 'plans build',
				acceptanceCriteria: [{ id: 'ac1', given: 'a standalone plan', when: 'a task is built', then: 'it resolves', operationalizes: [] }],
			}],
			openQuestions: [],
		},
		citations: [{ id: 'c1', kind: 'step-output', ref: 's2' }],
	};
}

function lldBody(): Record<string, unknown> {
	return {
		hldContextSlice: { frameworkSummary: 'standalone', rolloutPhase: 'standalone', ownedContracts: [], consumedContracts: [], boundary: {}, nonFunctional: {} },
		contractDetails: { surfaceLevel: 'internal', api: [] },
		dataModelChanges: [],
		interactionWithShared: [],
		errorPaths: { errorCases: [], edgeCases: [], invariantsToPreserve: [] },
		testStrategy: { testLevels: [], acceptanceMapping: [], testFramework: 'node:test' },
		alternativesConsidered: [{ id: 'a1', name: 'x', oneLineSummary: 'x', approach: 'x', pros: ['x'], cons: ['x'], costEstimate: 'S' }],
		chosenAlternative: 'a1',
		openQuestions: [],
	};
}

async function slugOf(i: WorkflowIntent, emit: Record<string, unknown>): Promise<string> {
	const result = await finalizeArtifact(i, {}, `wf-${i.workflow}-naming`, 5, emit, 'client');
	assert.equal(result.ok, true, `finalize failed: ${JSON.stringify((result as { failure?: unknown }).failure)}`);
	if (!result.ok) throw new Error('unreachable');
	return String((result.finalized.artifact.meta as { epicSlug?: string }).epicSlug);
}

// ---------------------------------------------------------------------------
// unit: head naming from title with focus fallback (SPEC, DEF, ISSUE, standalone LLD)
// ---------------------------------------------------------------------------

test('c00559b7 — headLabel derives from the title, and falls back to the focus for an absent, blank or degenerate title', () => {
	assert.equal(headLabel(TITLE, FOCUS), TITLE_SLUG);
	assert.notEqual(TITLE_SLUG, FOCUS_SLUG, 'the fixture must tell the two sources apart');
	assert.equal(headLabel(undefined, FOCUS), FOCUS_SLUG);
	assert.equal(headLabel('   ', FOCUS), FOCUS_SLUG);
	assert.equal(headLabel(DEGENERATE_TITLE, FOCUS), FOCUS_SLUG);
	assert.equal(headLabel(undefined, undefined), 'untitled');
});

test('c00559b7 — a SPEC with a title is labelled from it; without one, from its focus as before', async () => {
	assert.equal(await slugOf(intent('brainstorm'), specEmit(TITLE)), TITLE_SLUG);
	assert.equal(await slugOf(intent('brainstorm'), specEmit()), FOCUS_SLUG, 'a title-less SPEC keeps the focus-derived label');
	assert.equal(await slugOf(intent('brainstorm'), specEmit(DEGENERATE_TITLE)), FOCUS_SLUG);
});

test('c00559b7 — a DEF with a title is labelled from it; without one, from its focus as before', async () => {
	assert.equal(await slugOf(intent('define'), defineEmit(TITLE)), TITLE_SLUG);
	assert.equal(await slugOf(intent('define'), defineEmit()), FOCUS_SLUG, 'a title-less DEF keeps the focus-derived label');
});

test('c00559b7 — an ISSUE is labelled from its defect title, falling back to the focus for a degenerate one', async () => {
	assert.equal(await slugOf(intent('issue', { magnitude: 'small' }), issueEmit(TITLE)), TITLE_SLUG);
	assert.equal(await slugOf(intent('issue', { magnitude: 'small' }), issueEmit(DEGENERATE_TITLE)), FOCUS_SLUG);
});

test('c00559b7 — a body title that is not a string is rejected as a schema failure', async () => {
	const bad = specEmit();
	(bad['body'] as Record<string, unknown>)['title'] = 42;
	const result = await finalizeArtifact(intent('brainstorm'), {}, 'wf-bad-title', 5, bad, 'client');
	assert.equal(result.ok, false);
});

test('c00559b7 — a first-time standalone LLD is labelled from storyTitle; a re-finalized one keeps its LLD head\'s label', async () => {
	const repo = mkdtempSync(join(tmpdir(), 'insrc-head-naming-'));
	try {
		mkdirSync(join(repo, '.insrc', 'artifacts'), { recursive: true });
		const params = { standalone: true, epicHash: '7e7e7e7e7e7e7e7e', storyId: 's1', sizeClass: 'feature', storyTitle: TITLE };
		const emit = { body: lldBody(), citations: [{ id: 'c1', kind: 'code', ref: 'src/x.ts' }] };

		// First time: nothing heads the work item yet, so the Story title names it.
		assert.equal(await slugOf(intent('design.story', params, repo), emit), TITLE_SLUG);
		// Without a storyTitle the focus answers, as before.
		assert.equal(await slugOf(intent('design.story', { ...params, storyTitle: undefined }, repo), emit), FOCUS_SLUG);

		// Re-finalized: the earlier LLD is on disk and heads the work item, so its
		// label holds even though this run carries a different Story title.
		writeFileSync(join(repo, '.insrc', 'artifacts', 'LLD-7e7e7e7e7e7e7e7e-s1.json'),
			JSON.stringify({ meta: { epicSlug: 'the-label-it-already-has', createdAt: '2026-10-01T00:00:00.000Z', standalone: true }, body: {} }));
		assert.equal(
			await slugOf(intent('design.story', { ...params, storyTitle: 'A wholly different story title' }, repo), emit),
			'the-label-it-already-has',
		);
	} finally { rmSync(repo, { recursive: true, force: true }); }
});
