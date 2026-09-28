/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * sc3 (S002) — the shared render engine + helpers.
 *
 * Run: npx tsx --test src/workflow/artifacts/format/__tests__/engine.test.ts
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
	renderFromFormat,
	computeSectionNumbers,
	sectionSlug,
	renderSharedContextReference,
	deriveHldContextRef,
	type SectionBindings,
} from '../engine.js';
import type { DocumentFormat, SectionSpec } from '../types.js';

const sec = (o: Partial<SectionSpec> & { id: string; heading: string }): SectionSpec => ({
	contentGuidance: '', required: false, numbered: true, source: 'body', ...o,
});

const FORMAT: DocumentFormat = {
	kind: 'lld',
	h1: 'LLD: X',
	summary: sec({ id: 'summary', heading: 'Summary', numbered: false, required: true }),
	sections: [
		sec({ id: 'ctx', heading: 'HLD context', source: 'shared-ref', required: true }),
		sec({ id: 'contract', heading: 'Contract details', required: true }),
		sec({ id: 'stories', heading: 'Stories' }),
		sec({ id: 'refs', heading: 'References' }),
	],
};

// ---- sectionSlug ----

test('sectionSlug: deterministic lowercase-kebab, number-prefixed with ordinal', () => {
	assert.equal(sectionSlug('Framework Summary'), 'framework-summary');
	assert.equal(sectionSlug('Framework Summary', '2'), '2-framework-summary');
	assert.equal(sectionSlug('Framework Summary', '2'), sectionSlug('Framework Summary', '2')); // stable
});

// ---- computeSectionNumbers ----

test('computeSectionNumbers: numbers body sections 1..N in order; unnumbered/envelope absent', () => {
	const nums = computeSectionNumbers(FORMAT);
	assert.equal(nums.get('ctx'), '1');
	assert.equal(nums.get('contract'), '2');
	assert.equal(nums.get('stories'), '3');
	assert.equal(nums.get('refs'), '4');
	assert.equal(nums.has('summary'), false); // envelope is unnumbered
});

// ---- renderSharedContextReference + deriveHldContextRef ----

test('renderSharedContextReference: reference line names source + human section, no prose', () => {
	const line = renderSharedContextReference({ sourceArtifactId: 'HLD-abc', sectionId: '2-framework-summary' });
	assert.equal(line, '> See **HLD-abc** § 2. Framework summary');
});

test('deriveHldContextRef: engine-derived HLD ref from epicHash', () => {
	assert.deepEqual(deriveHldContextRef('c5824e17eccf0c14'),
		{ sourceArtifactId: 'HLD-c5824e17eccf0c14', sectionId: '2-framework-summary' });
});

// ---- renderFromFormat ----

function baseBindings(over: Partial<Record<string, () => unknown>> = {}): SectionBindings {
	return {
		summary:  () => ({ lines: ['A plain-language abstract.'] }),
		ctx:      () => ({ ref: { sourceArtifactId: 'HLD-abc', sectionId: '2-framework-summary' } }),
		contract: () => ({ lines: ['contract body'] }),
		stories:  () => ({ items: [{ title: 'S001 — one', lines: ['user value'] }, { title: 'S002 — two', lines: ['uv2'] }] }),
		refs:     () => ({ lines: ['[c1] doc — r'] }),
		...(over as SectionBindings),
	};
}

test('renderFromFormat: envelope + numbered sections + nested item numbers + shared-ref line', () => {
	const md = renderFromFormat(FORMAT, baseBindings(), { h1: 'LLD: X' });
	assert.ok(md.startsWith('# LLD: X\n'), 'short H1 first');
	assert.match(md, /## Summary\n\nA plain-language abstract\./);      // unnumbered envelope
	assert.match(md, /## Contents\n\n1\. \[HLD context\]\(#1-hld-context\)/); // numbered TOC
	assert.match(md, /## 1\. HLD context\n\n> See \*\*HLD-abc\*\* § 2\. Framework summary/); // shared-ref de-dup
	assert.match(md, /## 2\. Contract details\n\ncontract body/);
	assert.match(md, /## 3\. Stories\n\n### 3\.1 S001 — one\n\nuser value/); // nested N.M
	assert.match(md, /### 3\.2 S002 — two/);
	assert.ok(!/## Summary/.test(md.split('## Contents')[1] ?? ''), 'Summary is before Contents');
});

test('renderFromFormat: a required body section with no binding throws (fail-fast)', () => {
	const missing = { ...baseBindings() } as Record<string, unknown>;
	delete missing['contract'];
	assert.throws(() => renderFromFormat(FORMAT, missing as SectionBindings, { h1: 'x' }),
		/required section 'contract'/);
});

test('renderFromFormat: an optional section with no binding is skipped (absent-safe)', () => {
	const b = baseBindings();
	const noStories = { ...b } as Record<string, unknown>;
	delete noStories['stories'];
	const md = renderFromFormat(FORMAT, noStories as SectionBindings, { h1: 'x' });
	assert.ok(!md.includes('Stories'), 'optional Stories section absent when unbound');
});

test('renderFromFormat: shared-ref falls back to ctx.defaultRef; empty section renders None', () => {
	const b = baseBindings({ ctx: () => ({}), stories: () => ({ items: [] }) });
	const md = renderFromFormat(FORMAT, b, { h1: 'x', defaultRef: { sourceArtifactId: 'HLD-z', sectionId: '2-framework-summary' } });
	assert.match(md, /## 1\. HLD context\n\n> See \*\*HLD-z\*\*/); // engine-derived default
	assert.match(md, /## 3\. Stories\n\n_None\._/);                  // empty → None
});
