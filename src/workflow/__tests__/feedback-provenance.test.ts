/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * A design record's document has no Feedback section, and feedback lives beside the head: the four artifact types render the
 * same with or without a stray `feedback` key in a stored legacy body, and a Feedback line added through the FeedbackService
 * is stored in the sidecar, leaves the head byte-identical and does not change the rendered document.
 *
 * Run: npx tsx --test --test-force-exit src/workflow/__tests__/feedback-provenance.test.ts
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { renderDefineMarkdown, type DefineArtifact, type DefineBody } from '../artifacts/define.js';
import { renderHldMarkdown, type HldArtifact, type HldBody } from '../artifacts/hld.js';
import { renderLldMarkdown, type LldArtifact, type LldBody } from '../artifacts/lld.js';
import { renderPlanMarkdown, type PlanArtifact, type PlanBody } from '../artifacts/plan.js';
import { lifecycleFor, resetLifecycleRegistry } from '../../daemon/lifecycle-registry.js';
import { draftMeta, writeHead } from './lifecycle-fixtures.js';

const REPO = '/tmp/feedback-repo';
const stray = [
	{ id: 'f1', author: 'reviewer@x', timestamp: '2026-09-28T00:00:00Z', target: { file: 'DEF.json', segment: { startLine: 2, endLine: 4 } }, comment: 'clarify the scope here', kind: 'suggestion' },
];
const HASH = 'abcabcabcabcabc0';

// --- bodies -----------------------------------------------------------------

function defineBody(): DefineBody {
	return {
		flavor: 'enhancement', problem: 'A twenty-plus character problem statement for the renderer.',
		nonGoals: [], assumptions: [], constraints: [],
		stories: [{ id: 's1', title: 'T', userValue: 'v', acceptanceCriteria: [{ id: 'ac1', given: 'g', when: 'w', then: 't', operationalizes: [] }] }],
		openQuestions: [],
	};
}
function hldBody(): HldBody {
	return {
		frameworkSummary: 'A framework summary long enough.', architectureShape: 'An architecture shape long enough.',
		sharedContracts: [], storyBoundaries: [{ storyId: 's1', owns: [], depends: [], internal: 'x' }],
		nonFunctional: {}, rolloutOverview: { phases: [], orderingRationale: '', riskyBits: [] },
		alternativesConsidered: [], chosenAlternative: 'a1', openQuestions: [],
	};
}
function lldBody(): LldBody {
	return {
		hldContextSlice: { frameworkSummary: 'f', ownedContracts: [], consumedContracts: [], boundary: { storyId: 's1', owns: [], depends: [], internal: 'x' }, adjacentBoundaries: [], rolloutPhase: 'p', nonFunctional: {} },
		contractDetails: { surfaceLevel: 'internal', api: [] },
		dataModelChanges: [], interactionWithShared: [],
		errorPaths: { errorCases: [], edgeCases: [], invariantsToPreserve: [] },
		testStrategy: { testLevels: [], acceptanceMapping: [], testFramework: 'node:test' },
		alternativesConsidered: [], chosenAlternative: 'a1', openQuestions: [],
	};
}
function planBody(): PlanBody {
	return { tasks: [{ id: 't1', title: 'T', summary: 's', size: 'S', order: 1, dependsOn: [], acceptanceChecks: [], derivedFrom: ['c1'], tests: [] }], testStrategyCoverage: [] };
}

// --- metas ------------------------------------------------------------------

const metaBase = { runId: 'r1', repoPath: REPO, createdAt: '2026-09-28T00:00:00Z', elapsedMs: 0, repoIndexedAt: null, schemaVersion: 1 } as const;
const defineArtifact = (body: DefineBody): DefineArtifact => ({ meta: { ...metaBase, workflow: 'define', epicHash: 'abcabcabcabcabc0', epicSlug: 'demo' }, body, citations: [{ id: 'c1', kind: 'doc', ref: 'r' }] });
const hldArtifact = (body: HldBody): HldArtifact => ({ meta: { ...metaBase, workflow: 'design.epic', epicHash: 'abcabcabcabcabc0', epicSlug: 'demo' }, body, citations: [{ id: 'c1', kind: 'doc', ref: 'r' }] });
const lldArtifact = (body: LldBody): LldArtifact => ({ meta: { ...metaBase, workflow: 'design.story', epicHash: 'abcabcabcabcabc0', epicSlug: 'demo', storyId: 's1', hldBaseRunId: 'h1', hldEffectiveHash: 'e1', hldAmendmentsApplied: [] }, body, citations: [{ id: 'c1', kind: 'doc', ref: 'r' }] });
const planArtifact = (body: PlanBody): PlanArtifact => ({ meta: { ...metaBase, workflow: 'plan', epicHash: 'abcabcabcabcabc0', epicSlug: 'demo', storyId: 's1', lldRunId: 'l1', lldEffectiveHash: 'e1' }, body, citations: [{ id: 'c1', kind: 'doc', ref: 'r' }] });

const CASES = [
	{ kind: 'define', render: (b: object) => renderDefineMarkdown(defineArtifact(b as DefineBody)), make: defineBody, art: (b: object) => defineArtifact(b as DefineBody) },
	{ kind: 'hld',    render: (b: object) => renderHldMarkdown(hldArtifact(b as HldBody)),           make: hldBody,    art: (b: object) => hldArtifact(b as HldBody) },
	{ kind: 'lld',    render: (b: object) => renderLldMarkdown(lldArtifact(b as LldBody)),           make: lldBody,    art: (b: object) => lldArtifact(b as LldBody) },
	{ kind: 'plan',   render: (b: object) => renderPlanMarkdown(planArtifact(b as PlanBody)),        make: planBody,   art: (b: object) => planArtifact(b as PlanBody) },
] as const;

// --- the document has no Feedback section ------------------------------------

for (const c of CASES) {
	test(`${c.kind}: the document renders the same with or without a stray feedback key, and has no Feedback heading`, () => {
		const plain = c.render(c.make());
		assert.equal(c.render({ ...c.make(), feedback: [] }), plain, `${c.kind}: an empty list changes nothing`);
		assert.equal(c.render({ ...c.make(), feedback: stray }), plain, `${c.kind}: a stored legacy list is not rendered`);
		assert.ok(!plain.includes('Feedback'), `${c.kind}: no Feedback heading`);
	});
}

// --- feedback is stored beside the head ---------------------------------------

const ID: Record<string, string> = { define: `DEF-${HASH}`, hld: `HLD-${HASH}`, lld: `LLD-${HASH}-s1`, plan: `PLAN-${HASH}-s1` };

for (const c of CASES) {
	test(`${c.kind}: feedback added through the FeedbackService is stored in the sidecar, leaves the head untouched and the document unchanged`, async () => {
		const root = mkdtempSync(join(tmpdir(), `insrc-fb-${c.kind}-`));
		try {
			const artifact = c.art(c.make());
			const id = ID[c.kind]!;
			writeHead(root, id, { meta: { ...artifact.meta, epicCreatedAt: '2026-09-28T00:00:00Z', ...draftMeta() }, body: artifact.body, citations: artifact.citations });
			const path = join(root, '.insrc', 'artifacts', `${id}.json`);
			const before = readFileSync(path, 'utf8');

			const entry = lifecycleFor(root).feedback;
			const actor = { id: 'github:reviewer', kind: 'person' as const, properties: {} };
			const stored = await entry.add(id, { text: 'clarify the scope here', kind: 'suggestion' }, actor);
			assert.equal(stored.text, 'clarify the scope here');
			assert.equal((await entry.entries(id)).length, 1);

			assert.equal(readFileSync(path, 'utf8'), before, 'the head is byte-identical');
			assert.equal(JSON.parse(before).body.feedback, undefined, 'and holds no feedback');
			assert.equal(c.render(JSON.parse(readFileSync(path, 'utf8')).body), c.render(c.make()), 'the document is unchanged');
		} finally {
			resetLifecycleRegistry();
			rmSync(root, { recursive: true, force: true });
		}
	});
}
