/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * ISSUE-36cbeeac485c0af7 — an LLD's quality must not depend on which model wrote it.
 *
 * Run: npx tsx --test --test-force-exit src/workflow/__tests__/lld-authoring-gates.test.ts
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { finalizeArtifact } from '../orchestrator.js';
import { markApprovedSync } from './lifecycle-fixtures.js';
import { renderLldMarkdown, type LldArtifact, type LldBody } from '../artifacts/lld.js';
import { defineArtifactPaths, hldArtifactPaths } from '../storage.js';
import type { WorkflowIntent } from '../types.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../../..');
const EPIC_HASH = 'b4e1c7d2a9f03e65';
const CREATED = '2026-11-08T07:42:28.275Z';
const TITLE = 'The title of the story';

function body(): LldBody {
	return {
		hldContextSlice: {
			frameworkSummary: 'standalone', ownedContracts: [], consumedContracts: [],
			boundary: { storyId: 's1', owns: [], depends: [], internal: 'the boundary text' },
			adjacentBoundaries: [], rolloutPhase: 'standalone', nonFunctional: {},
		},
		contractDetails: { surfaceLevel: 'internal', api: [] },
		dataModelChanges: [],
		interactionWithShared: [],
		errorPaths: { errorCases: [], edgeCases: [], invariantsToPreserve: [] },
		testStrategy: { testLevels: [], acceptanceMapping: [], testFramework: 'node:test' },
		alternativesConsidered: [
			{ id: 'a1', name: 'first', oneLineSummary: 'one', approach: 'the first approach', pros: ['p'], cons: ['c'], costEstimate: 'S' },
			{ id: 'a2', name: 'second', oneLineSummary: 'two', approach: 'the second approach', pros: ['p'], cons: ['c'], costEstimate: 'M', reasonRejected: 'too big' },
		],
		chosenAlternative: 'a1',
		openQuestions: [],
	};
}

const CITATIONS = [{ id: 'c1', kind: 'code', ref: 'src/x.ts' }];

function standaloneIntent(repo: string, storyTitle?: string): WorkflowIntent {
	return {
		workflow: 'design.story', focus: 'a story', repoPath: repo, repoIndexedAt: null,
		params: { standalone: true, epicHash: EPIC_HASH, storyId: 's1', sizeClass: 'feature', ...(storyTitle !== undefined ? { storyTitle } : {}) },
	} as unknown as WorkflowIntent;
}

function epicIntent(repo: string): WorkflowIntent {
	return {
		workflow: 'design.story', focus: 'a story', repoPath: repo, repoIndexedAt: null,
		params: { epicHash: EPIC_HASH, storyId: 's1' },
	} as unknown as WorkflowIntent;
}

function seedEpic(repo: string): void {
	const dp = defineArtifactPaths(repo, EPIC_HASH, CREATED, 'epic');
	mkdirSync(dirname(dp.json), { recursive: true });
	writeFileSync(dp.json, JSON.stringify({
		meta: { workflow: 'define', runId: 'def', schemaVersion: 1, epicHash: EPIC_HASH, epicSlug: 'gates', createdAt: CREATED, epicCreatedAt: CREATED },
		body: {
			flavor: 'new-capability', problem: 'x', nonGoals: [], assumptions: [], constraints: [],
			stories: [{ id: 's1', title: TITLE, userValue: 'v', acceptanceCriteria: [], dependsOn: [] }],
			openQuestions: [],
		},
		citations: [],
	}, null, 2));
	markApprovedSync(dp.json);
	const hp = hldArtifactPaths(repo, EPIC_HASH, CREATED, 'epic');
	writeFileSync(hp.json, JSON.stringify({
		meta: { workflow: 'design.epic', runId: 'hld', schemaVersion: 1, epicHash: EPIC_HASH, epicSlug: 'gates', createdAt: CREATED, epicCreatedAt: CREATED },
		body: {
			frameworkSummary: 'x', architectureShape: 'x [[c1]]', sharedContracts: [],
			storyBoundaries: [{ storyId: 's1', owns: [], depends: [], internal: 'the boundary text' }],
			nonFunctional: {},
			rolloutOverview: { phases: [{ name: 'A', includesStories: ['s1'], rationale: 'x', backwardCompat: '', featureFlag: null }], orderingRationale: 'x', riskyBits: [] },
			alternativesConsidered: [{ id: 'a1', name: 'x', oneLineSummary: 'x', approach: 'x', pros: ['x'], cons: ['x'], costEstimate: 'S' }],
			chosenAlternative: 'a1', openQuestions: [],
		},
		citations: [{ id: 'c1', kind: 'analyze-bundle', ref: 'x' }],
	}, null, 2));
	markApprovedSync(hp.json);
}

async function inRepo(prefix: string, run: (repo: string) => Promise<void>): Promise<void> {
	const repo = mkdtempSync(join(tmpdir(), prefix));
	try { await run(repo); } finally { rmSync(repo, { recursive: true, force: true }); }
}

function firstLine(md: string): string | undefined {
	return md.split('\n').find(l => l.startsWith('# '));
}

function stored(meta: Partial<LldArtifact['meta']>): LldArtifact {
	return {
		meta: {
			workflow: 'design.story', runId: 'r', repoPath: '/tmp/none', createdAt: CREATED, repoIndexedAt: null, elapsedMs: 1, schemaVersion: 1,
			epicHash: EPIC_HASH, epicSlug: 'gates', storyId: 's1', hldBaseRunId: 'h', hldEffectiveHash: 'e', hldAmendmentsApplied: [], ...meta,
		} as LldArtifact['meta'],
		body: body(),
		citations: [{ id: 'c1', kind: 'code', ref: 'src/x.ts' }],
	};
}

// ---------------------------------------------------------------------------
// t1 — the title
// ---------------------------------------------------------------------------

test('title: the H1 shows id and title', () => {
	assert.equal(firstLine(renderLldMarkdown(stored({ storyTitle: TITLE }))), `# LLD: STORY-${EPIC_HASH}-s1 — ${TITLE}`);
});

test('title: a title with a line break renders on one line', () => {
	assert.equal(firstLine(renderLldMarkdown(stored({ storyTitle: '  First\n  second\tthird ' }))), `# LLD: STORY-${EPIC_HASH}-s1 — First second third`);
});

test('title: the H1 shows id and title on both finalize paths', async () => {
	await inRepo('lld-title-standalone-', async repo => {
		const r = await finalizeArtifact(standaloneIntent(repo, TITLE), {}, 'wf', 5, { body: body(), citations: CITATIONS }, 'client');
		assert.ok(r.ok, r.ok ? '' : JSON.stringify(r.failure));
		assert.equal(firstLine(r.finalized.renderedMd), `# LLD: STORY-${EPIC_HASH}-s1 — ${TITLE}`);
	});
	await inRepo('lld-title-standalone-fallback-', async repo => {
		const r = await finalizeArtifact(standaloneIntent(repo), {}, 'wf', 5, { body: body(), citations: CITATIONS }, 'client');
		assert.ok(r.ok, r.ok ? '' : JSON.stringify(r.failure));
		assert.equal(firstLine(r.finalized.renderedMd), `# LLD: STORY-${EPIC_HASH}-s1 — the boundary text`);
	});
	await inRepo('lld-title-epic-', async repo => {
		seedEpic(repo);
		const r = await finalizeArtifact(epicIntent(repo), {}, 'wf', 5, { body: body(), citations: CITATIONS }, 'client');
		assert.ok(r.ok, r.ok ? '' : JSON.stringify(r.failure));
		assert.equal(firstLine(r.finalized.renderedMd), `# LLD: STORY-${EPIC_HASH}-s1 — ${TITLE}`);
	});
});

test('stored: a stored LLD with no storyTitle renders byte-identically', () => {
	const dir = 'docs/standalone/show-provider-icons-chat-dropdowns-relabel-E20261107546198e1/S001/LLD.md';
	const artifact = JSON.parse(readFileSync(join(ROOT, '.insrc/artifacts/LLD-546198e11c24c1e3-s1.json'), 'utf8')) as LldArtifact;
	assert.equal(artifact.meta.storyTitle, undefined, 'the fixture is an LLD written before the title existed');
	assert.equal(renderLldMarkdown(artifact).trimEnd(), readFileSync(join(ROOT, dir), 'utf8').trimEnd());
});
