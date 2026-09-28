/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * sc3 (S002, a2) — the editable FORMAT-template encoding round-trips, and a
 * malformed template is rejected loudly (never silently mis-parsed).
 *
 * Run: npx tsx --test src/workflow/artifacts/format/__tests__/template.test.ts
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { formatToTemplate, parseFormatTemplate, FormatTemplateParseError } from '../template.js';
import { defaultFormat } from '../formats.js';

const KINDS = ['define', 'hld', 'lld', 'plan'] as const;

for (const kind of KINDS) {
	test(`round-trip: parse(serialize(defaultFormat('${kind}'))) deep-equals the in-code default`, () => {
		const fmt = defaultFormat(kind);
		const round = parseFormatTemplate(formatToTemplate(fmt), kind);
		assert.deepStrictEqual(round, fmt);
	});
}

test('parse: a template with no header is REJECTED', () => {
	assert.throws(() => parseFormatTemplate('# Epic: x\n\n## Summary\n'), FormatTemplateParseError);
});

test('parse: a kind mismatch against expectKind is REJECTED', () => {
	const text = formatToTemplate(defaultFormat('define'));
	assert.throws(() => parseFormatTemplate(text, 'hld'), FormatTemplateParseError);
});

test('parse: a section directive with no id is REJECTED', () => {
	const text = [
		'<!-- insrc:format v1 kind=define -->',
		'# Epic: x',
		'<!-- insrc:summary source=body required -->',
		'## Summary',
	].join('\n');
	assert.throws(() => parseFormatTemplate(text), FormatTemplateParseError);
});

test('parse: an invalid audience is REJECTED', () => {
	const text = [
		'<!-- insrc:format v1 kind=define -->',
		'# Epic: x',
		'<!-- insrc:summary id=summary source=body audience=nonsense -->',
		'## Summary',
	].join('\n');
	assert.throws(() => parseFormatTemplate(text), FormatTemplateParseError);
});

test('parse: an unknown directive attribute is REJECTED', () => {
	const text = [
		'<!-- insrc:format v1 kind=define -->',
		'# Epic: x',
		'<!-- insrc:summary id=summary bogus=1 -->',
		'## Summary',
	].join('\n');
	assert.throws(() => parseFormatTemplate(text), FormatTemplateParseError);
});

test('parse: a directive with no following heading is REJECTED', () => {
	const text = [
		'<!-- insrc:format v1 kind=define -->',
		'# Epic: x',
		'<!-- insrc:summary id=summary source=body -->',
		'',
		'<!-- insrc:section id=problem source=body numbered -->',
		'## Problem',
	].join('\n');
	assert.throws(() => parseFormatTemplate(text), FormatTemplateParseError);
});

test('parse: an item-section before an itemFormat directive is REJECTED', () => {
	const text = [
		'<!-- insrc:format v1 kind=plan -->',
		'# Plan: x',
		'<!-- insrc:summary id=summary source=body -->',
		'## Summary',
		'<!-- insrc:item-section id=size source=body -->',
		'### Size',
	].join('\n');
	assert.throws(() => parseFormatTemplate(text), FormatTemplateParseError);
});

test('serialize: a per-repo edit (reordered/renamed section) parses back into the edited format', () => {
	// Author a hand-edited template: rename the Problem heading + drop Non-goals.
	const text = [
		'<!-- insrc:format v1 kind=define -->',
		'# Epic: <short name>',
		'<!-- insrc:summary id=summary source=body audience=business required -->',
		'## Overview',
		'A house-style summary.',
		'<!-- insrc:section id=problem source=body required numbered -->',
		'## The Problem',
		'<!-- insrc:section id=references source=body required numbered -->',
		'## References',
	].join('\n');
	const fmt = parseFormatTemplate(text, 'define');
	assert.equal(fmt.summary.heading, 'Overview');
	assert.equal(fmt.sections[0]?.heading, 'The Problem');
	assert.equal(fmt.sections[0]?.id, 'problem');
	assert.equal(fmt.sections.length, 2);
	assert.equal(fmt.itemFormat, undefined);
});
