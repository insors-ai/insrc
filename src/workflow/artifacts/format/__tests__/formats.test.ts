/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * sc3 (S002) — the bundled default DocumentFormat constants encode the reviewed
 * mocks: a short H1, an unnumbered audience-tagged Summary, a human-first ordered
 * section set, and NAMED extension points for S003/S004. renderFromFormat over a
 * default format produces the numbered envelope.
 *
 * Run: npx tsx --test src/workflow/artifacts/format/__tests__/formats.test.ts
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { DEFINE_FORMAT, HLD_FORMAT, LLD_FORMAT, PLAN_FORMAT, defaultFormat } from '../formats.js';
import { computeSectionNumbers, renderFromFormat, type SectionBindings } from '../engine.js';
import type { DocumentFormat } from '../types.js';

const ALL: DocumentFormat[] = [DEFINE_FORMAT, HLD_FORMAT, LLD_FORMAT, PLAN_FORMAT];

test('every default format: unnumbered required Summary, a References section, and a numbered body', () => {
	for (const f of ALL) {
		assert.equal(f.summary.id, 'summary');
		assert.equal(f.summary.numbered, false, `${f.kind} Summary is the unnumbered abstract`);
		assert.equal(f.summary.required, true);
		assert.ok(f.summary.audience !== undefined, `${f.kind} Summary is audience-tagged`);
		assert.ok(f.sections.some(s => s.id === 'references'), `${f.kind} has a References section`);
		assert.ok(computeSectionNumbers(f).size >= 3, `${f.kind} numbers its body sections`);
	}
});

test('defaultFormat(kind) returns the matching format', () => {
	assert.equal(defaultFormat('define'), DEFINE_FORMAT);
	assert.equal(defaultFormat('hld'), HLD_FORMAT);
	assert.equal(defaultFormat('lld'), LLD_FORMAT);
	assert.equal(defaultFormat('plan'), PLAN_FORMAT);
});

test('DEF format: business-tagged Summary + FR section + Stories, in human-first order', () => {
	assert.equal(DEFINE_FORMAT.summary.audience, 'business');
	const ids = DEFINE_FORMAT.sections.map(s => s.id);
	assert.deepEqual(ids, ['problem', 'fr', 'nonGoals', 'assumptions', 'constraints', 'stories', 'references', 'openQuestions', 'feedback']);
	assert.equal(DEFINE_FORMAT.sections.find(s => s.id === 'fr')!.source, 'fr');
});

test('LLD format: HLD context is a shared-ref (de-dup) + NAMED S003/S004 extension slots', () => {
	const hldCtx = LLD_FORMAT.sections.find(s => s.id === 'hldContext')!;
	assert.equal(hldCtx.source, 'shared-ref');
	assert.equal(hldCtx.required, true);
	assert.deepEqual(LLD_FORMAT.sections.filter(s => s.source === 'extension').map(s => s.id), ['diagramsEr', 'ux']);
});

test('renderFromFormat over the LLD default: numbered envelope with a populated Summary', () => {
	const bindings: SectionBindings = {
		summary:    () => ({ lines: ['This story makes documents readable.'] }),
		hldContext: () => ({ ref: { sourceArtifactId: 'HLD-abc', sectionId: '2-framework-summary' } }),
		contract:   () => ({ lines: ['contract'] }),
		references: () => ({ lines: ['[c1] doc — r'] }),
	};
	const md = renderFromFormat(LLD_FORMAT, bindings, { h1: 'LLD: s2 — X' });
	assert.match(md, /^# LLD: s2 — X\n/);
	assert.match(md, /## Summary\n\nThis story makes documents readable\./);
	assert.match(md, /## 1\. HLD context\n\n> See \*\*HLD-abc\*\*/);
	assert.match(md, /## Contents\n/);
	// extension + unbound optional sections are absent-safe (skipped).
	assert.ok(!md.includes('## Diagrams'));
	assert.ok(!md.includes('## UX'));
});
