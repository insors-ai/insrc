/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * S001 (provenance/feedback) t5/t8 — the Feedback section is additive + absent-safe
 * across all four artifact types, and the append→re-read→re-render loop is real.
 *
 *  (t5/t8a) BYTE-IDENTITY: a body with NO feedback (or an empty feedback[])
 *           renders byte-identically to before — the omit-slot guarantees no
 *           `## Feedback` heading leaks; a body WITH feedback grows exactly that
 *           section.
 *  (t8b)    INTEGRATION: for each of DEF/HLD/LLD/PLAN, write a real
 *           `{ meta, body, citations }` JSON to a temp `.insrc/artifacts`, append
 *           feedback via the writer, re-read, and assert the entry is present with
 *           full attribution AND the re-rendered doc shows the Feedback section.
 *  (t8c)    LEGACY: an artifact with no `feedback` field re-renders unchanged, then
 *           accepts a first append.
 *
 * Run: npx tsx --test --test-force-exit src/workflow/__tests__/feedback-provenance.test.ts
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { renderDefineMarkdown, type DefineArtifact, type DefineBody } from '../artifacts/define.js';
import { renderHldMarkdown, type HldArtifact, type HldBody } from '../artifacts/hld.js';
import { renderLldMarkdown, type LldArtifact, type LldBody } from '../artifacts/lld.js';
import { renderPlanMarkdown, type PlanArtifact, type PlanBody } from '../artifacts/plan.js';
import { appendFeedback, writeArtifactJson, type ArtifactShape } from '../artifacts/provenance/writer.js';
import type { FeedbackRecord } from '../artifacts/provenance/types.js';

const REPO = '/tmp/feedback-repo';
const feedback: FeedbackRecord = [
	{ id: 'f1', author: 'reviewer@x', timestamp: '2026-09-28T00:00:00Z', target: { file: 'DEF.json', segment: { startLine: 2, endLine: 4 } }, comment: 'clarify the scope here', kind: 'suggestion' },
];

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

// --- t5 / t8a — byte-identity ----------------------------------------------

for (const c of CASES) {
	test(`${c.kind}: feedback ABSENT renders byte-identically to empty[]; no "## Feedback" leaks`, () => {
		const absent = c.render(c.make());
		const empty  = c.render({ ...c.make(), feedback: [] });
		assert.equal(absent, empty, `${c.kind}: absent vs empty[] must be byte-identical`);
		assert.ok(!absent.includes('Feedback'), `${c.kind}: no Feedback heading when absent`);
	});

	test(`${c.kind}: feedback PRESENT adds a Feedback section with the comment`, () => {
		const withFb = c.render({ ...c.make(), feedback });
		assert.match(withFb, /## \d+\. Feedback/, `${c.kind}: numbered Feedback section present`);
		assert.match(withFb, /clarify the scope here/, `${c.kind}: the comment renders`);
		assert.match(withFb, /reviewer@x/);
	});
}

// --- t8b — integration: write → append → re-read → re-render ----------------

for (const c of CASES) {
	test(`${c.kind}: write real {meta,body,citations} JSON → append → re-read shows entry → re-render shows Feedback`, () => {
		const root = mkdtempSync(join(tmpdir(), `insrc-fb-${c.kind}-`));
		const dir = join(root, '.insrc', 'artifacts');
		mkdirSync(dir, { recursive: true });
		const path = join(dir, `${c.kind}.json`);
		try {
			const artifact = c.art(c.make());
			writeArtifactJson(path, artifact as unknown as ArtifactShape);

			const res = appendFeedback({ artifactPath: path, entry: { author: 'reviewer@x', comment: 'clarify the scope here', target: { file: `${c.kind}.json` }, kind: 'suggestion' } });
			assert.equal(res.total, 1);

			const reread = JSON.parse(readFileSync(path, 'utf8'));
			assert.equal(reread.body.feedback.length, 1);
			assert.equal(reread.body.feedback[0].author, 'reviewer@x');
			assert.equal(reread.body.feedback[0].comment, 'clarify the scope here');
			assert.equal(reread.body.feedback[0].kind, 'suggestion');
			assert.equal(reread.body.feedback[0].id, res.entryId);
			assert.ok(typeof reread.body.feedback[0].timestamp === 'string' && reread.body.feedback[0].timestamp.length > 0);

			const md = c.render(reread.body);
			assert.match(md, /## \d+\. Feedback/);
			assert.match(md, /clarify the scope here/);
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});
}

// --- t8c — legacy artifact re-renders unchanged, then accepts a first append -

test('legacy (no feedback field) re-renders unchanged, then accepts a first append', () => {
	const root = mkdtempSync(join(tmpdir(), 'insrc-fb-legacy-'));
	const dir = join(root, '.insrc', 'artifacts');
	mkdirSync(dir, { recursive: true });
	const path = join(dir, 'HLD.json');
	try {
		const legacy = hldArtifact(hldBody());
		// Simulate an on-disk legacy artifact with NO feedback key at all.
		writeFileSync(path, JSON.stringify(legacy, null, 2));
		const before = renderHldMarkdown(legacy);
		assert.ok(!before.includes('Feedback'));

		const res = appendFeedback({ artifactPath: path, entry: { author: 'a', comment: 'first note', target: { file: 'HLD.json' } } });
		assert.equal(res.total, 1);
		const reread = JSON.parse(readFileSync(path, 'utf8'));
		const after = renderHldMarkdown(reread as HldArtifact);
		assert.match(after, /## \d+\. Feedback/);
		assert.match(after, /first note/);
	} finally {
		rmSync(root, { recursive: true, force: true });
	}
});
