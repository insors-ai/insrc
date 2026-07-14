/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Bundle assembler unit tests.
 *
 * Pure functional tests -- no LLM, no I/O. The assembler is
 * deterministic for a given bundle and these tests pin the
 * Markdown shape end-to-end.
 *
 * Coverage:
 *   - Render order matches the spec
 *   - System layer renders without a heading; others render with `## <Label>`
 *   - Empty layers via empty body are omitted
 *   - Empty layers via meta.emptyLayers are omitted (even with non-empty body)
 *   - Contract footer is appended exactly once and lands at the tail
 *   - Whitespace-only bodies are treated as empty
 *   - omitEmpty helper round-trips correctly
 *
 * Run:
 *   npx tsx --test src/insrc/analyze/context/__tests__/bundle.test.ts
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { CONTRACT_FOOTER_MD } from '../../contract.js';
import {
	assembleMarkdown,
	LAYER_LABELS,
	omitEmpty,
	RENDER_ORDER,
} from '../bundle.js';
import type { AnalyzeContextBundle } from '../types.js';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function bundleWith(overrides: Partial<AnalyzeContextBundle>): AnalyzeContextBundle {
	return {
		system:    'You are a code analyst.',
		focus:     'Focus on entrypoints.',
		summary:   'Repo summary here.',
		structure: 'Module tree here.',
		surface:   'API surface here.',
		artefacts: 'Source excerpt here.',
		upstream:  '',
		...overrides,
	};
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

test('RENDER_ORDER is the documented seven layers in spec order', () => {
	assert.deepEqual(RENDER_ORDER, [
		'system',
		'focus',
		'summary',
		'structure',
		'surface',
		'artefacts',
		'upstream',
	]);
});

test('LAYER_LABELS covers every layer in RENDER_ORDER', () => {
	for (const layer of RENDER_ORDER) {
		assert.equal(typeof LAYER_LABELS[layer], 'string');
		assert.ok(LAYER_LABELS[layer]!.length > 0);
	}
});

// ---------------------------------------------------------------------------
// omitEmpty helper
// ---------------------------------------------------------------------------

test('omitEmpty returns empty string for empty body', () => {
	assert.equal(omitEmpty('Focus', ''), '');
});

test('omitEmpty returns empty string for whitespace-only body', () => {
	assert.equal(omitEmpty('Focus', '   \n  \t '), '');
});

test('omitEmpty renders heading + trimmed body for non-empty body', () => {
	const out = omitEmpty('Focus', '  hello world\n');
	assert.equal(out, '## Focus\n\nhello world\n');
});

// ---------------------------------------------------------------------------
// assembleMarkdown -- happy path
// ---------------------------------------------------------------------------

test('assembleMarkdown renders all seven layers in order with the footer at tail', () => {
	const bundle = bundleWith({ upstream: 'Upstream JSON renders here.' });
	const out = assembleMarkdown(bundle);

	const expectedOrder = [
		bundle.system,
		'## Focus',
		bundle.focus,
		'## Summary',
		bundle.summary,
		'## Structure',
		bundle.structure,
		'## Surface',
		bundle.surface,
		'## Artefacts',
		bundle.artefacts,
		'## Upstream',
		bundle.upstream,
		'## Contract reminder',
	];

	let lastIdx = -1;
	for (const fragment of expectedOrder) {
		const idx = out.indexOf(fragment);
		assert.notEqual(idx, -1, `missing fragment: ${fragment}`);
		assert.ok(idx > lastIdx, `fragment out of order: ${fragment}`);
		lastIdx = idx;
	}
});

test('assembleMarkdown renders the system layer without a heading', () => {
	const bundle = bundleWith({});
	const out = assembleMarkdown(bundle);
	const systemIdx = out.indexOf(bundle.system);
	const firstHeadingIdx = out.indexOf('## ');
	assert.ok(systemIdx >= 0);
	assert.ok(firstHeadingIdx > systemIdx, 'system layer must precede the first ## heading');
});

test('assembleMarkdown appends contract footer exactly once', () => {
	const bundle = bundleWith({});
	const out = assembleMarkdown(bundle);
	const matches = out.match(/## Contract reminder/g) ?? [];
	assert.equal(matches.length, 1);
	assert.ok(out.endsWith(CONTRACT_FOOTER_MD), 'footer must land at the tail');
});

// ---------------------------------------------------------------------------
// assembleMarkdown -- empty-layer omission
// ---------------------------------------------------------------------------

test('assembleMarkdown omits layers whose body is empty', () => {
	const bundle = bundleWith({ artefacts: '', upstream: '' });
	const out = assembleMarkdown(bundle);
	assert.ok(!out.includes('## Artefacts'), '## Artefacts must be omitted when body is empty');
	assert.ok(!out.includes('## Upstream'),  '## Upstream must be omitted when body is empty');
});

test('assembleMarkdown omits layers whose body is whitespace-only', () => {
	const bundle = bundleWith({ artefacts: '   \n\n  \t ' });
	const out = assembleMarkdown(bundle);
	assert.ok(!out.includes('## Artefacts'));
});

test('assembleMarkdown omits layers listed in meta.emptyLayers even with non-empty body', () => {
	const bundle = bundleWith({
		surface: 'this content should be dropped',
		meta: {
			mode:          'run',
			shaper:        'code',
			toolCalls:     3,
			modelId:       'qwen3-coder:14b',
			emptyLayers:   ['surface', 'upstream'],
			schemaVersion: 1,
		},
	});
	const out = assembleMarkdown(bundle);
	assert.ok(!out.includes('## Surface'),  '## Surface must be omitted (in emptyLayers)');
	assert.ok(!out.includes('this content should be dropped'));
});

test('assembleMarkdown without meta uses body-emptiness only', () => {
	const bundle = bundleWith({ upstream: '' });
	const out = assembleMarkdown(bundle);
	assert.ok(!out.includes('## Upstream'));
	// All other non-empty layers still render
	assert.ok(out.includes('## Focus'));
	assert.ok(out.includes('## Summary'));
});

test('assembleMarkdown with an all-empty bundle still emits contract footer', () => {
	const bundle: AnalyzeContextBundle = {
		system:    '',
		focus:     '',
		summary:   '',
		structure: '',
		surface:   '',
		artefacts: '',
		upstream:  '',
	};
	const out = assembleMarkdown(bundle);
	assert.equal(out.trim(), CONTRACT_FOOTER_MD.trim());
});
