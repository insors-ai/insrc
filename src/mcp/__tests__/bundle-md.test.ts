/**
 * Unit tests for `renderBundleAsMarkdown` -- the MCP-layer bundle
 * formatter. Nothing in this test hits an LLM or LMDB; we build a
 * synthetic bundle + assert on the rendered markdown.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { COMPLETENESS_NOT_RECORDED, renderCompletenessLine, type AnswerReport } from '../../analyze/completeness.js';
import type { AnalyzeContextBundle } from '../../analyze/context/types.js';
import { renderBundleAsMarkdown } from '../bundle-md.js';

function makeBundle(overrides?: Partial<AnalyzeContextBundle>): AnalyzeContextBundle {
	return {
		system:    'code-shaper: structural-map anchored on x',
		focus:     'Intent focus: x\nAnswer type: structural-map',
		summary:   'This is a summary paragraph.',
		structure: '## Modules\n- foo\n- bar',
		surface:   '- foo.py :: FooClass',
		artefacts: '```py\ndef foo(): ...\n```',
		upstream:  '',
		meta: {
			mode:         'run',
			shaper:       'code',
			toolCalls:    4,
			modelId:      'qwen3.6:35b-a3b',
			emptyLayers:  ['upstream'],
			schemaVersion: 1,
			repoLastIndexedAt: 1_720_000_000_000,
		},
		...overrides,
	};
}

test('render includes the meta comment prefix by default', () => {
	const md = renderBundleAsMarkdown(makeBundle());
	// The completeness line is first; the meta comment is the block after it.
	assert.match(md.split('\n\n')[1] ?? '', /^<!-- insrc-analyze meta: shaper=code mode=run/);
});

test('meta line can be suppressed via includeMeta=false', () => {
	const md = renderBundleAsMarkdown(makeBundle(), { includeMeta: false });
	assert.doesNotMatch(md, /insrc-analyze meta/);
	assert.match(md.split('\n\n')[1] ?? '', /^## System/);
});

test('the completeness line is the first line of the rendered answer, and an answer with no report says completeness was not recorded', () => {
	const report: AnswerReport = {
		completeness: {
			complete:   false,
			incomplete: [{ sourceId: 'search.text [e2]', sourceKind: 'lookup', reason: 'limit of 30 hits reached' }],
			failed:     [{ sourceId: 'symbol.locate [e3]', sourceKind: 'lookup', reason: 'the graph store is closed' }],
		},
	};
	for (const opts of [undefined, { includeMeta: false }]) {
		const md = renderBundleAsMarkdown(makeBundle({ report }), opts);
		assert.equal(md.split('\n')[0], renderCompletenessLine(report));
		assert.match(md.split('\n')[0] ?? '', /search\.text \[e2\].*symbol\.locate \[e3\]/);
	}
	assert.equal(
		renderBundleAsMarkdown(makeBundle({ report: { completeness: { complete: true, incomplete: [], failed: [] } } })).split('\n')[0],
		'Complete.',
	);

	// A bundle built before the report existed carries none.
	for (const opts of [undefined, { includeMeta: false }]) {
		const md = renderBundleAsMarkdown(makeBundle(), opts);
		assert.equal(md.split('\n')[0], 'Completeness was not recorded for this answer.');
		assert.equal(md.split('\n')[0], COMPLETENESS_NOT_RECORDED);
	}
});

test('render walks the seven layers in order + emits headings', () => {
	const md = renderBundleAsMarkdown(makeBundle());
	const idxSystem    = md.indexOf('## System');
	const idxFocus     = md.indexOf('## Focus');
	const idxSummary   = md.indexOf('## Summary');
	const idxStructure = md.indexOf('## Structure');
	const idxSurface   = md.indexOf('## Surface');
	const idxArtefacts = md.indexOf('## Artefacts');
	assert.ok(idxSystem >= 0);
	assert.ok(idxFocus > idxSystem);
	assert.ok(idxSummary > idxFocus);
	assert.ok(idxStructure > idxSummary);
	assert.ok(idxSurface > idxStructure);
	assert.ok(idxArtefacts > idxSurface);
});

test('empty layers are dropped from the rendered output', () => {
	const md = renderBundleAsMarkdown(makeBundle());
	// upstream is empty in the fixture
	assert.doesNotMatch(md, /## Upstream/);
});

test('layers filter narrows the rendered output', () => {
	const md = renderBundleAsMarkdown(makeBundle(), {
		layers: ['summary', 'structure'],
	});
	assert.match(md, /## Summary/);
	assert.match(md, /## Structure/);
	assert.doesNotMatch(md, /## System/);
	assert.doesNotMatch(md, /## Focus/);
});

test('missing meta renders "(unset)" instead of throwing', () => {
	// Cast to Partial: the framework normally never emits an unset
	// meta but we defend anyway.
	const md = renderBundleAsMarkdown({ ...makeBundle(), meta: undefined } as AnalyzeContextBundle);
	assert.match(md, /insrc-analyze meta: \(unset\)/);
});

test('meta includes repoIndexedAt when set', () => {
	const md = renderBundleAsMarkdown(makeBundle());
	assert.match(md, /repoIndexedAt=/);
});
