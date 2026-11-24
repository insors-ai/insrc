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
