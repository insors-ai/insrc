/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * ISSUE-1b3caadf04023d33 / LLD s1 / t1 — the optional Epic impact analysis on the LLD and the PLAN: the section renders only when the
 * field is present, an artifact without it renders byte-for-byte as before (the goldens were produced by the renderers before this
 * change), and the first-step context schemas accept the field and a context without it.
 *
 * Run: npx tsx --test src/workflow/__tests__/epic-impact-artifacts.test.ts
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import Ajv from 'ajv';

import { renderLldMarkdown } from '../artifacts/lld.js';
import { renderPlanMarkdown } from '../artifacts/plan.js';
import { epicImpactBodyLines, epicImpactProblem, isEpicImpactAnalysis } from '../artifacts/epic-impact.js';
import type { EpicImpactAnalysis } from '../artifacts/epic-impact.js';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { finalizeArtifact } from '../orchestrator.js';
import { buildArtifactId, defineArtifactId, lldArtifactId } from '../storage.js';
import { approvedMeta, writeHead } from './lifecycle-fixtures.js';
import type { WorkflowIntent } from '../types.js';
import { lldContextSchema } from '../runners/design-story/schemas.js';
import { planContextSchema } from '../runners/plan/schemas.js';
import { lldFixture, planFixture } from './helpers/epic-impact-fixtures.js';

const golden = (name: string): string => readFileSync(fileURLToPath(new URL(`./fixtures/epic-impact/${name}`, import.meta.url)), 'utf8');

const ANALYSIS: EpicImpactAnalysis = {
	applies: true,
	storiesCovered: ['s1'],
	findings: 'Story s1 changed the settings store; this Story reads it through the same writer and keeps the root keys.',
	sources: ['docs/epics/x/S001/BUILD.md', 'src/store.ts'],
};

test('epic-impact-artifacts.test.ts: an LLD and a PLAN with an epicImpact render an \'Epic impact analysis\' section, one without it renders exactly as before, and a synthesize with a non-null digest and no analysis (or an empty one) is rejected with the reason', () => {
	// without the field: byte-for-byte what the renderers produced before the section existed
	assert.equal(renderLldMarkdown(lldFixture()), golden('lld.golden.md'), 'the LLD without epicImpact is unchanged');
	assert.equal(renderPlanMarkdown(planFixture()), golden('plan.golden.md'), 'the PLAN without epicImpact is unchanged');

	// with the field: a numbered 'Epic impact analysis' section carrying the analysis
	for (const [name, md] of [
		['LLD', renderLldMarkdown({ ...lldFixture(), body: { ...lldFixture().body, epicImpact: ANALYSIS } })],
		['PLAN', renderPlanMarkdown({ ...planFixture(), body: { ...planFixture().body, epicImpact: ANALYSIS } })],
	] as const) {
		assert.match(md, /## \d+\. Epic impact analysis/, `${name}: the section is numbered and present`);
		assert.ok(md.includes('**Stories covered:** `s1`'), `${name}: names the covered Story`);
		assert.ok(md.includes(ANALYSIS.findings), `${name}: carries the findings`);
		assert.ok(md.includes('- src/store.ts'), `${name}: lists the sources`);
	}

	// applies:false renders the reason and not the analysis lines
	const none: EpicImpactAnalysis = { applies: false, reason: 'the Epic has no earlier built Story', storiesCovered: [], findings: '', sources: [] };
	const noneMd = renderLldMarkdown({ ...lldFixture(), body: { ...lldFixture().body, epicImpact: none } });
	assert.ok(noneMd.includes('**Does not apply**: the Epic has no earlier built Story'));
	assert.ok(!noneMd.includes('**Stories covered:**'));
	assert.deepEqual(epicImpactBodyLines({ ...none, reason: undefined }), ['**Does not apply**.']);

	// the section sits before the HLD context in the LLD and before the Tasks in the PLAN
	const lldMd = renderLldMarkdown({ ...lldFixture(), body: { ...lldFixture().body, epicImpact: ANALYSIS } });
	assert.ok(lldMd.indexOf('Epic impact analysis') < lldMd.indexOf('HLD context'), 'LLD: before the HLD context');
	const planMd = renderPlanMarkdown({ ...planFixture(), body: { ...planFixture().body, epicImpact: ANALYSIS } });
	assert.ok(planMd.indexOf('Epic impact analysis') < planMd.indexOf('## 2. Tasks') || planMd.indexOf('Epic impact analysis') < planMd.indexOf('Tasks\n'), 'PLAN: before the Tasks');

	// the rule synthesize applies: a non-null digest needs an analysis that applies, names its Stories, has findings and cites sources
	assert.equal(epicImpactProblem(false, undefined), undefined, 'no digest: no analysis needed');
	assert.equal(epicImpactProblem(false, none), undefined, 'no digest: applies:false is fine');
	assert.equal(epicImpactProblem(true, ANALYSIS), undefined, 'a digest and a complete analysis');
	assert.match(epicImpactProblem(true, undefined) ?? '', /is required and is missing/);
	assert.match(epicImpactProblem(true, none) ?? '', /must apply/);
	assert.match(epicImpactProblem(true, { ...ANALYSIS, storiesCovered: [] }) ?? '', /names no Story/);
	assert.match(epicImpactProblem(true, { ...ANALYSIS, findings: '   ' }) ?? '', /no findings/);
	assert.match(epicImpactProblem(true, { ...ANALYSIS, sources: [] }) ?? '', /cites no source/);

	// the shape guard
	assert.equal(isEpicImpactAnalysis(ANALYSIS), true);
	for (const bad of [null, {}, { ...ANALYSIS, applies: 'yes' }, { ...ANALYSIS, storiesCovered: [1] }, { ...ANALYSIS, findings: undefined }, { ...ANALYSIS, sources: 'x' }, { ...ANALYSIS, reason: 3 }]) {
		assert.equal(isEpicImpactAnalysis(bad), false, JSON.stringify(bad));
	}
});

test('epic-impact-artifacts.test.ts: the first-step schemas of design.story and plan accept an epicImpact and still accept a context without one', () => {
	const ajv = new Ajv({ allErrors: true, strict: false });
	const bundle = { kind: 'symbol.locate', focus: 'f', summary: 's' };
	for (const [name, schema] of [['design.story', lldContextSchema], ['plan', planContextSchema]] as const) {
		const validate = ajv.compile(schema);
		assert.equal(validate({ analyzeBundles: [bundle] }), true, `${name}: without epicImpact`);
		assert.equal(validate({ analyzeBundles: [bundle], epicImpact: ANALYSIS }), true, `${name}: with epicImpact`);
		assert.equal(validate({ analyzeBundles: [bundle], epicImpact: { applies: false, reason: 'first Story', storiesCovered: [], findings: '', sources: [] } }), true, `${name}: applies:false`);
		assert.equal(validate({ analyzeBundles: [bundle], epicImpact: { applies: true } }), false, `${name}: an incomplete analysis is refused`);
		assert.equal(validate({ analyzeBundles: [bundle], epicImpact: { ...ANALYSIS, extra: 1 } }), false, `${name}: an unknown key is refused`);
	}
});

const EH = 'c1d2e3f4a5b6c7d8';
const STAMP = '2026-01-01T00:00:00.000Z';

/** An Epic of s1 and s2 with an approved Define; s1 has an approved BUILD when `s1Built`, and s2 an approved standalone-shaped LLD. */
function synthRepo(s1Built: boolean): string {
	const repo = mkdtempSync(join(tmpdir(), 'insrc-impact-synth-'));
	writeHead(repo, defineArtifactId(EH), {
		meta: { workflow: 'define', epicHash: EH, epicSlug: 'x', createdAt: STAMP, epicCreatedAt: STAMP, ...approvedMeta() },
		body: { flavor: 'new-capability', problem: 'p', nonGoals: [], assumptions: [], constraints: [], openQuestions: [],
			stories: ['s1', 's2'].map(id => ({ id, title: `Title ${id}`, userValue: 'v', acceptanceCriteria: [], dependsOn: [] })) },
		citations: [],
	});
	writeHead(repo, lldArtifactId(EH, 's2'), { meta: { workflow: 'design.story', runId: 'r', storyId: 's2', epicHash: EH, epicSlug: 'x', createdAt: STAMP, epicCreatedAt: STAMP, standalone: true, ...approvedMeta() }, body: lldFixture().body, citations: [] });
	if (s1Built) {
		writeHead(repo, buildArtifactId(EH, 's1'), {
			meta: { workflow: 'build', epicHash: EH, createdAt: STAMP, ...approvedMeta() },
			body: { summary: 'built s1', tasks: [{ id: 't1', passed: true }], changeLog: [{ target: { file: 'src/s1.ts' } }] },
			citations: [],
		});
	}
	return repo;
}

const intentFor = (workflow: 'design.story' | 'plan', repo: string): WorkflowIntent =>
	({ workflow, repoPath: repo, focus: 'f', params: { epicHash: EH, storyId: 's2' } }) as unknown as WorkflowIntent;

function messageOf(r: Awaited<ReturnType<typeof finalizeArtifact>>): string {
	return r.ok ? '' : JSON.stringify(r.failure);
}

test('epic-impact-artifacts.test.ts: design.story and plan synthesize reject a later Story with no real analysis, carry the first step\'s analysis verbatim, and do not ask a Story with nothing built for one', async () => {
	const later = synthRepo(true);
	const alone = synthRepo(false);
	try {
		const lldEmit = { body: lldFixture().body, citations: lldFixture().citations };
		const planEmit = { body: planFixture().body, citations: planFixture().citations };

		for (const [workflow, emit] of [['design.story', lldEmit], ['plan', planEmit]] as const) {
			// nothing from the first step and nothing authored: rejected with the reason
			const missing = await finalizeArtifact(intentFor(workflow, later), {}, 'run', 1, emit, 'client');
			assert.equal(missing.ok, false, `${workflow}: no analysis is rejected`);
			assert.match(messageOf(missing), /Epic impact analysis: .*is required and is missing/);
			// an empty one is rejected
			const empty = await finalizeArtifact(intentFor(workflow, later), { s1: { epicImpact: { ...ANALYSIS, findings: ' ' } } }, 'run', 1, emit, 'client');
			assert.match(messageOf(empty), /no findings/);
			// the Epic impact rule does not fire for a Story with nothing built
			const free = await finalizeArtifact(intentFor(workflow, alone), {}, 'run', 1, emit, 'client');
			assert.doesNotMatch(messageOf(free), /Epic impact analysis/, `${workflow}: not asked when nothing is built`);
		}

		// the LLD carries the first step's analysis, not a retyped one (a standalone run, so no Epic or HLD is needed to reach the carry)
		const none: EpicImpactAnalysis = { applies: false, reason: 'standalone', storiesCovered: [], findings: '', sources: [] };
		const standaloneLld = { ...intentFor('design.story', later), params: { standalone: true, epicHash: EH, storyId: 's1' } } as unknown as WorkflowIntent;
		const lldCarried = await finalizeArtifact(standaloneLld, { s1: { epicImpact: none } }, 'run', 1, { ...lldEmit, body: { ...lldEmit.body, epicImpact: { ...none, reason: 'retyped' } } }, 'client');
		const lldBody = lldCarried.ok ? (lldCarried.finalized.artifact as { body: { epicImpact?: unknown } }).body : undefined;
		assert.deepEqual(lldBody?.epicImpact, none, lldCarried.ok ? '' : messageOf(lldCarried));

		// the PLAN carries the first step's analysis, not a retyped one
		const carried = await finalizeArtifact(intentFor('plan', later), { s1: { epicImpact: ANALYSIS } }, 'run', 1, { ...planEmit, body: { ...planEmit.body, epicImpact: { ...ANALYSIS, findings: 'retyped' } } }, 'client');
		assert.equal(carried.ok, true, messageOf(carried));
		if (carried.ok) assert.deepEqual((carried.finalized.artifact as { body: { epicImpact?: unknown } }).body.epicImpact, ANALYSIS);
	} finally { rmSync(later, { recursive: true, force: true }); rmSync(alone, { recursive: true, force: true }); }
});
