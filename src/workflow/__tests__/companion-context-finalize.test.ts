/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * LLD-d9f85b3c S001/t8 — finalize writes every companion as a page of the
 * shared companion shell, with one header per finalize site.
 *
 * Each case drives the real finalizer (finalizeArtifact) and reads the pages it
 * wrote, so the header the reader sees is what is asserted: the source document
 * id and link, the work-item id, and the same values on every companion of one
 * artifact.
 *
 * Run: npx tsx --test src/workflow/__tests__/companion-context-finalize.test.ts
 */

import { test, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

import { _setCompanionHeaderDepsForTests, finalizeArtifact } from '../orchestrator.js';
import { markApprovedSync } from './lifecycle-fixtures.js';
import { defineArtifactPaths, workItemAnchorCreatedAt } from '../storage.js';
import { _setCompanionRuntimeDirsForTests } from '../artifacts/companion/shell.js';
import type { WorkflowIntent } from '../types.js';
import type { LldArtifact } from '../artifacts/lld.js';
import type { HldArtifact } from '../artifacts/hld.js';
import type { CompanionArtifactRef } from '../artifacts/companion/types.js';

const EPIC_HASH = 'b7c3d1e2f3a4b5c6';
const CREATED = '2026-07-20T10:00:00.000Z';

const PINNED = { now: () => new Date(2026, 9, 11, 14, 32), gitUserName: () => 'Subho Ghosh', osUserName: () => 'subho' };

afterEach(() => {
	_setCompanionHeaderDepsForTests(undefined);
	_setCompanionRuntimeDirsForTests(undefined);
});

const erDefinition = {
	classes: {
		Customer: { attributes: { id: { range: 'string', identifier: true }, name: { range: 'string' } } },
		Order:    { attributes: { id: { range: 'string', identifier: true }, customer: { range: 'Customer', required: true } } },
	},
};
const uxDefinition = { type: 'AdaptiveCard', body: [{ type: 'TextBlock', text: 'Orders' }, { type: 'Input.Text', id: 'q', label: 'Search' }] };
const sequenceDefinition = { participants: [{ id: 'ui' }, { id: 'api' }], messages: [{ from: 'ui', to: 'api', label: 'list orders' }] };
const componentDependencyDefinition = { components: [{ id: 'ui' }, { id: 'api' }], dependencies: [{ from: 'ui', to: 'api' }] };

function minimalLldBody(): Record<string, unknown> {
	return {
		summary: { prose: 'Customers place orders through one screen. More detail follows.' },
		hldContextSlice: { frameworkSummary: 'standalone', ownedContracts: [], consumedContracts: [], boundary: { storyId: 's1', owns: [], depends: [], internal: 'Order intake' }, adjacentBoundaries: [], rolloutPhase: 'standalone', nonFunctional: {} },
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
		workflow: 'design.story', focus: 'a standalone feature with a data model', repoPath: repo,
		repoIndexedAt: null,
		params: { standalone: true, epicHash: EPIC_HASH, storyId: 's1', sizeClass: 'feature', storyTitle: 'Order intake screen' },
	} as unknown as WorkflowIntent;
}

/** The four header-table values of a written page. */
function headerOf(html: string): Record<string, string> {
	return Object.fromEntries([...html.matchAll(/<tr><th>([^<]+)<\/th><td>(.*?)<\/td><\/tr>/g)].map(m => [m[1]!, m[2]!]));
}

function pages(repo: string, refs: readonly CompanionArtifactRef[]): Map<string, string> {
	return new Map(refs.map(r => [r.relPath.split('/').pop()!, readFileSync(join(repo, r.relPath), 'utf8')]));
}

// ---------------------------------------------------------------------------
// integration: finalize[standalone-LLD]: four companions with header (LLD id + work item), same header values on all
// ---------------------------------------------------------------------------

test('finalize[standalone-LLD]: all four companions carry the header with the LLD id and work item, identically', async () => {
	_setCompanionHeaderDepsForTests(PINNED);
	const repo = mkdtempSync(join(tmpdir(), 'ctx-fin-'));
	try {
		const emit = {
			body: { ...minimalLldBody(), erDefinition, uxDefinition, sequenceDefinition, componentDependencyDefinition },
			citations: [{ id: 'c1', kind: 'code', ref: 'src/x.ts' }],
		};
		const result = await finalizeArtifact(standaloneLldIntent(repo), {}, 'wf-ctx', 5, emit, 'client');
		assert.equal(result.ok, true, JSON.stringify((result as { failure?: unknown }).failure));
		if (!result.ok) return;
		const artifact = result.finalized.artifact as LldArtifact;
		const refs = artifact.body.companions ?? [];
		assert.deepEqual(refs.map(r => [r.kind, r.relPath.split('/').pop()]), [
			['diagram-mermaid', 'er-model.html'],
			['ux-mock', 'ux-mock.html'],
			['diagram-mermaid', 'sequence-diagram.html'],
			['diagram-mermaid', 'component-dependency.html'],
		], 'ref kinds and file names are unchanged');

		const written = pages(repo, refs);
		const headers = [...written.values()].map(headerOf);
		for (const h of headers) assert.deepEqual(h, headers[0], 'every companion shows the same header');
		// A first-time standalone LLD heads its own work item: the header names its Story by artifact id.
		assert.deepEqual(headers[0], {
			'Work item':  `STORY-${EPIC_HASH}-s1`,
			'Source doc': `<a href="./LLD.md">LLD-${EPIC_HASH}-s1</a>`,
			'Date':       '2026-10-11 14:32',
			'User':       'Subho Ghosh',
		});
		for (const html of written.values()) {
			assert.ok(html.includes('<p class="context">Standalone story S001 · Order intake screen — Customers place orders through one screen.</p>'));
			assert.doesNotMatch(html.replace(/<script>[\s\S]*?<\/script>/g, ''), /https?:\/\//, 'offline');
		}
		assert.match(written.get('er-model.html')!, /<pre class="mermaid">erDiagram/);
		assert.match(written.get('ux-mock.html')!, /<span class="kind">UX mock<\/span>/);
		// The markdown links the companions and never inlines them.
		assert.match(result.finalized.renderedMd, /\[ER model\]\([^)]*er-model\.html\)/);
		assert.doesNotMatch(result.finalized.renderedMd, /<!doctype html>/i);
	} finally { rmSync(repo, { recursive: true, force: true }); }
});

// ---------------------------------------------------------------------------
// integration: finalize[standalone-LLD]: described definitions pass the HIGH gate and appear in the tables
// ---------------------------------------------------------------------------

test('finalize[standalone-LLD]: described definitions pass the HIGH gate and their narrative and descriptions reach the page', async () => {
	_setCompanionHeaderDepsForTests(PINNED);
	const repo = mkdtempSync(join(tmpdir(), 'ctx-fin-desc-'));
	try {
		const described = {
			narrative: 'Customers place orders.',
			classes: {
				Customer: { description: 'A buyer.', attributes: { id: { range: 'string', identifier: true, description: 'Customer key.' } } },
				Order:    { description: 'One purchase.', attributes: { id: { range: 'string', identifier: true }, customer: { range: 'Customer', required: true, description: 'Who placed it.' } } },
			},
		};
		const uxDescribed = { type: 'AdaptiveCard', narrative: 'The order screen.', body: [{ type: 'Input.Text', id: 'q', label: 'Search', description: 'Filters the list.' }] };
		const emit = { body: { ...minimalLldBody(), erDefinition: described, uxDefinition: uxDescribed }, citations: [{ id: 'c1', kind: 'code', ref: 'src/x.ts' }] };
		const result = await finalizeArtifact(standaloneLldIntent(repo), {}, 'wf-ctx-desc', 5, emit, 'client');
		assert.equal(result.ok, true, `the HIGH gate must pass: ${JSON.stringify((result as { failure?: unknown }).failure)}`);
		if (!result.ok) return;
		const written = pages(repo, (result.finalized.artifact as LldArtifact).body.companions ?? []);
		const er = written.get('er-model.html')!;
		assert.ok(er.includes('<p>Customers place orders.</p>'));
		assert.ok(er.includes('<tr><td>Customer</td><td>A buyer.</td><td>id</td><td class="missing">—</td></tr>'));
		assert.ok(er.includes('<td>Who placed it.</td>'));
		const ux = written.get('ux-mock.html')!;
		assert.ok(ux.includes('<p>The order screen.</p>'));
		assert.ok(ux.includes('<td>Filters the list.</td>'));
	} finally { rmSync(repo, { recursive: true, force: true }); }
});

// ---------------------------------------------------------------------------
// integration: finalize: missing runtime asset -> companion skipped, artifact written
// ---------------------------------------------------------------------------

test('finalize: a missing runtime asset skips the companions and still writes the artifact', async () => {
	const empty = mkdtempSync(join(tmpdir(), 'ctx-fin-noassets-'));
	_setCompanionRuntimeDirsForTests({ companion: empty, mermaid: empty });
	const repo = mkdtempSync(join(tmpdir(), 'ctx-fin-missing-'));
	try {
		const emit = { body: { ...minimalLldBody(), erDefinition, uxDefinition }, citations: [{ id: 'c1', kind: 'code', ref: 'src/x.ts' }] };
		const result = await finalizeArtifact(standaloneLldIntent(repo), {}, 'wf-ctx-missing', 5, emit, 'client');
		assert.equal(result.ok, true, 'the artifact is still finalized');
		if (!result.ok) return;
		const artifact = result.finalized.artifact as LldArtifact;
		assert.equal(artifact.body.companions, undefined, 'no companion ref is attached');
		assert.deepEqual(artifact.body.erDefinition, erDefinition, 'the definition stays in-body');
		const written = readdirSync(repo, { recursive: true }).map(String).filter(f => f.endsWith('.html'));
		assert.deepEqual(written, [], 'no page is written');
	} finally {
		rmSync(repo, { recursive: true, force: true });
		rmSync(empty, { recursive: true, force: true });
	}
});

// ---------------------------------------------------------------------------
// integration: finalize[design.epic]: HLD id as source doc
// ---------------------------------------------------------------------------

function seedOneStoryEpic(repo: string): void {
	const dp = defineArtifactPaths(repo, EPIC_HASH, CREATED, 'epic', 'order-epic');
	mkdirSync(dirname(dp.json), { recursive: true });
	writeFileSync(dp.json, JSON.stringify({
		meta: { workflow: 'define', runId: 'def-x', schemaVersion: 1, epicHash: EPIC_HASH, epicSlug: 'order-epic', createdAt: CREATED, epicCreatedAt: CREATED },
		body: {
			flavor: 'new-capability', problem: 'x', nonGoals: [], assumptions: [], constraints: [],
			stories: [{ id: 's1', title: 'The data model story', userValue: 'v', acceptanceCriteria: [], dependsOn: [] }],
			openQuestions: [],
		},
		citations: [],
	}, null, 2));
	markApprovedSync(dp.json);
}

test('finalize[design.epic]: HLD companions name the HLD as the source doc and the Epic as the work item', async () => {
	_setCompanionHeaderDepsForTests(PINNED);
	const repo = mkdtempSync(join(tmpdir(), 'ctx-fin-hld-'));
	try {
		seedOneStoryEpic(repo);
		const body = {
			summary: { prose: 'Orders are taken through one intake path. Details below.' },
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
			erDefinition,
		};
		const intent = { workflow: 'design.epic', focus: 'HLD', repoPath: repo, repoIndexedAt: null, params: { epicHash: EPIC_HASH } } as unknown as WorkflowIntent;
		const result = await finalizeArtifact(intent, {}, 'wf-hld', 5, { body, citations: [{ id: 'c1', kind: 'analyze-bundle', ref: 'x' }] }, 'client');
		assert.equal(result.ok, true, JSON.stringify((result as { failure?: unknown }).failure));
		if (!result.ok) return;
		const refs = (result.finalized.artifact as HldArtifact).body.companions ?? [];
		assert.equal(refs.length, 1);
		const html = readFileSync(join(repo, refs[0]!.relPath), 'utf8');
		assert.deepEqual(headerOf(html), {
			'Work item':  `EPIC-${EPIC_HASH}`,
			'Source doc': `<a href="./HLD.md">HLD-${EPIC_HASH}</a>`,
			'Date':       '2026-10-11 14:32',
			'User':       'Subho Ghosh',
		});
		assert.ok(html.includes('<p class="context">Epic order-epic · Orders are taken through one intake path.</p>'));
	} finally { rmSync(repo, { recursive: true, force: true }); }
});
