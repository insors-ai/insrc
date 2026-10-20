/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Every root producer stamps meta.epicCreatedAt (s1/t5): finalizeDefine,
 * finalizeBrainstorm, finalizeIssue and finalizeStandaloneLld (even as the first
 * record), and a later record reads the stamp instead of using its own clock.
 *
 * Run: npx tsx --test src/workflow/__tests__/anchor-producers.test.ts
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { finalizeArtifact } from '../orchestrator.js';
import { resolveEpicAnchor } from '../storage.js';
import type { WorkflowIntent } from '../types.js';

const FOCUS = 'a root producer under test';
const HASH = 'c4d5e6f708192a3b';

function intent(workflow: string, repoPath: string, params: Record<string, unknown> = {}): WorkflowIntent {
	return { workflow, focus: FOCUS, repoPath, repoIndexedAt: null, params } as unknown as WorkflowIntent;
}

const specEmit = {
	body: { title: 'Stamp the root', category: 'requirements', intent: 'Every root carries the anchor.', scopeBoundary: 'Producers only.', nonGoals: [], decisions: [], openItems: [] },
	citations: [{ id: 'c1', kind: 'step-output', ref: 's1' }],
};
const issueEmit = {
	body: { title: 'Stamp the root', reproduction: 'Finalize an issue.', rootCause: 'No stamp.', fixIntent: 'Stamp it.' },
	citations: [{ id: 'c1', kind: 'code', ref: 'src/workflow/orchestrator.ts' }],
};
const defineEmit = {
	body: {
		title: 'Stamp the root', flavor: 'enhancement', problem: 'Roots carry no anchor.',
		nonGoals: [], assumptions: [], constraints: [],
		stories: [{ id: 's1', title: 'Stamp', userValue: 'one folder', acceptanceCriteria: [{ id: 'ac1', given: 'a root', when: 'it is finalized', then: 'it carries the anchor', operationalizes: [] }] }],
		openQuestions: [],
	},
	citations: [{ id: 'c1', kind: 'step-output', ref: 's2' }],
};
function lldEmit(): Record<string, unknown> {
	return {
		body: {
			hldContextSlice: { frameworkSummary: 'standalone', ownedContracts: [], consumedContracts: [], boundary: { storyId: 's1', owns: [], depends: [], internal: 'x' }, adjacentBoundaries: [], rolloutPhase: 'standalone', nonFunctional: {} },
			contractDetails: { surfaceLevel: 'internal', api: [] },
			dataModelChanges: [],
			interactionWithShared: [],
			errorPaths: { errorCases: [], edgeCases: [], invariantsToPreserve: [] },
			testStrategy: { testLevels: [], acceptanceMapping: [], testFramework: 'node:test' },
			alternativesConsidered: [{ id: 'a1', name: 'n', oneLineSummary: 'x', approach: 'x', pros: ['x'], cons: ['x'], costEstimate: 'S' }],
			chosenAlternative: 'a1',
			openQuestions: [],
		},
		citations: [{ id: 'c1', kind: 'code', ref: 'src/x.ts' }],
	};
}

type Meta = { createdAt?: string | undefined; epicCreatedAt?: string | undefined };
async function metaOf(i: WorkflowIntent, emit: Record<string, unknown>, runId: string): Promise<Meta> {
	const result = await finalizeArtifact(i, {}, runId, 5, emit, 'client');
	assert.equal(result.ok, true, `finalize failed: ${JSON.stringify((result as { failure?: unknown }).failure)}`);
	if (!result.ok) throw new Error('unreachable');
	return result.finalized.artifact.meta as unknown as Meta;
}

function tempRepo(): { repo: string; done: () => void } {
	const repo = mkdtempSync(join(tmpdir(), 'insrc-producers-'));
	mkdirSync(join(repo, '.insrc', 'artifacts'), { recursive: true });
	return { repo, done: () => rmSync(repo, { recursive: true, force: true }) };
}

test('every root producer stamps epicCreatedAt and later records read it', async () => {
	// each root stamps its own creation time as the Epic's when nothing anchors yet
	for (const [workflow, emit, params] of [
		['brainstorm', specEmit, {}],
		['issue', issueEmit, {}],
		['define', defineEmit, {}],
		['design.story', lldEmit(), { standalone: true, epicHash: HASH, storyId: 's1' }],
	] as const) {
		const r = tempRepo();
		try {
			const meta = await metaOf(intent(workflow, r.repo, { ...params }), emit as unknown as Record<string, unknown>, `wf-${workflow}-root`);
			assert.equal(typeof meta.epicCreatedAt, 'string', `${workflow} stamps epicCreatedAt`);
			assert.equal(meta.epicCreatedAt, meta.createdAt, `${workflow} is the first record, so its clock is the Epic's`);
		} finally { r.done(); }
	}

	// a standalone LLD that is the first record stamps, and a later record reads that stamp rather than its own clock
	const r = tempRepo();
	try {
		const first = await metaOf(intent('design.story', r.repo, { standalone: true, epicHash: HASH, storyId: 's1' }), lldEmit(), 'wf-lld-1');
		writeFileSync(join(r.repo, '.insrc', 'artifacts', `LLD-${HASH}-s1.json`), JSON.stringify({ meta: { ...first, epicHash: HASH, storyId: 's1', standalone: true, epicSlug: 'first-lld' }, body: {} }));
		assert.equal(resolveEpicAnchor(r.repo, HASH), first.epicCreatedAt, 'the stamp is the anchor');
		await new Promise(resolve => setTimeout(resolve, 5));
		const second = await metaOf(intent('design.story', r.repo, { standalone: true, epicHash: HASH, storyId: 's2' }), lldEmit(), 'wf-lld-2');
		assert.notEqual(second.createdAt, first.createdAt, 'the second record has its own clock');
		assert.equal(second.epicCreatedAt, first.epicCreatedAt, 'but reads the Epic\'s stamp');
	} finally { r.done(); }

	// a DEF head: a later standalone-flavoured record reads the DEF's createdAt
	const d = tempRepo();
	try {
		const head = '2026-03-02T10:00:00.000Z';
		writeFileSync(join(d.repo, '.insrc', 'artifacts', `ISSUE-${HASH}.json`), JSON.stringify({ meta: { issueHash: HASH, epicSlug: 'an-issue', standalone: true, createdAt: head }, body: {} }));
		const lld = await metaOf(intent('design.story', d.repo, { standalone: true, epicHash: HASH, storyId: 's1' }), lldEmit(), 'wf-lld-issue');
		assert.equal(lld.epicCreatedAt, head);
	} finally { d.done(); }
});
