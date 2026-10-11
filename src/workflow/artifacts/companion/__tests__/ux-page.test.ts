/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * LLD-d9f85b3c S001/t7 — the UX companion page builder, on the S002 document
 * review card used by the approved mock.
 *
 * Run:
 *   npx tsx --test src/workflow/artifacts/companion/__tests__/ux-page.test.ts
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { uxDefinitionToPage, validateUxDefinition, type UxDefinition } from '../ux.js';
import { renderCompanionPage, type DescriptionCell } from '../shell.js';

/** The S002 document review pane, as in the approved ux-mock. */
const S002: UxDefinition = {
	type: 'AdaptiveCard',
	narrative: "The pane lists a document's functional requirements, one row each.",
	body: [
		{ type: 'TextBlock', text: 'insrc docs review', weight: 'bolder', size: 'medium', description: 'Name of the review surface.' },
		{ type: 'TextBlock', text: 'DEF-bfe98ff7f97178cf — build-vs-code-plugin-ui-integration', isSubtle: true, size: 'small' },
		{ type: 'Input.ChoiceSet', id: 'jumpTo', label: 'Jump to section', choices: [{ title: '2. Functional requirements', value: 's2' }], description: 'Jumps to any numbered section.' },
		{ type: 'TextBlock', text: '2. Functional requirements', weight: 'bolder' },
		{
			type: 'Container', description: 'One functional requirement: its id, then its outcome.',
			items: [{ type: 'ColumnSet', columns: [
				{ type: 'Column', width: 'auto', items: [{ type: 'TextBlock', text: 'E20260929bfe98ff7:FR001', color: 'accent', description: 'Identifier written straight off the record.' }] },
				{ type: 'Column', items: [{ type: 'TextBlock', text: 'A reviewer sees its functional requirements as discrete outcomes.' }] },
			] }],
		},
		{
			type: 'Container',
			items: [{ type: 'ColumnSet', columns: [
				{ type: 'Column', items: [{ type: 'TextBlock', text: 'E20260929bfe98ff7:FR002' }] },
				{ type: 'Column', items: [{ type: 'TextBlock', text: 'A reviewer can navigate by structure.' }] },
			] }],
		},
		{ type: 'Input.Text', id: 'note', label: 'Reviewer note', placeholder: 'Optional note for the author…', isMultiline: true },
		{ type: 'ActionSet', actions: [
			{ type: 'Action.Submit', title: 'Approve', description: 'Approves the artifact and advances the chain.' },
			{ type: 'Action.Submit', title: 'Request changes' },
			{ type: 'Action.OpenUrl', title: 'Open source', url: './LLD.md', description: 'Opens the source document.' },
		] },
	],
};

const page = uxDefinitionToPage(S002, 'Document review pane');
const html = page.visual.kind === 'html' ? page.visual.html : '';

/** The marker numbers in the card, in document order. */
function markerNumbers(markup: string): number[] {
	return [...markup.matchAll(/<span class="ux-pin(?: ux-pin--abs)?">(\d+)<\/span>/g)].map(m => Number(m[1]));
}

// ---------------------------------------------------------------------------
// unit: ux page builder: stable depth-first markers match key-elements table (S002 card fixture)
// ---------------------------------------------------------------------------

test('d9f85b3c t7 — key elements are numbered depth-first: top-level text, inputs, described elements and every action', () => {
	assert.deepEqual(validateUxDefinition(S002), []);
	const rows = page.description[0]!.rows;
	const summary = rows.map(r => [(r[0] as { text: string }).text, r[1], r[2], r[3]]);
	assert.deepEqual(summary, [
		['1', 'insrc docs review', 'TextBlock', null],
		['2', 'DEF-bfe98ff7f97178cf — build-vs-code-plugin-ui-integration', 'TextBlock', null],
		['3', 'Jump to section', 'Input.ChoiceSet', 'jumpTo'],
		['4', '2. Functional requirements', 'TextBlock', null],
		['5', 'Container', 'Container', null],
		['6', 'E20260929bfe98ff7:FR001', 'TextBlock', null],
		['7', 'Reviewer note', 'Input.Text', 'note'],
		['8', 'Approve', 'Action.Submit', null],
		['9', 'Request changes', 'Action.Submit', null],
		['10', 'Open source', 'Action.OpenUrl', './LLD.md'],
	]);
	assert.equal(page.description[0]!.lead, '10 key elements. Numbers match the markers on the mock; layout-only containers are omitted.');
});

test('d9f85b3c t7 — the markers in the card are exactly the table numbers, in the same order', () => {
	const tableNumbers = page.description[0]!.rows.map(r => Number((r[0] as { text: string }).text));
	assert.deepEqual(markerNumbers(html), tableNumbers);
	assert.ok(html.includes('<p class="ux-text ux-bolder ux-size-medium"><span class="ux-pin">1</span>insrc docs review</p>'));
	assert.ok(html.includes('<div class="ux-container"><span class="ux-pin ux-pin--abs">5</span>'));
	assert.ok(!/<div class="ux-column"[^>]*><span class="ux-pin/.test(html), 'layout-only columns carry no marker');
});

test('d9f85b3c t7 — numbering is stable: the same definition always gives the same markers and table', () => {
	const again = uxDefinitionToPage(JSON.parse(JSON.stringify(S002)) as UxDefinition, 'Document review pane');
	assert.deepEqual(again, page);
});

test('d9f85b3c t7 — descriptions fill the table, and an undescribed key element gets a null cell', () => {
	const byNumber = new Map(page.description[0]!.rows.map(r => [(r[0] as { text: string }).text, r[4] as DescriptionCell]));
	assert.equal(byNumber.get('1'), 'Name of the review surface.');
	assert.equal(byNumber.get('2'), null);
	assert.equal(byNumber.get('10'), 'Opens the source document.');
});

// ---------------------------------------------------------------------------
// unit: ux page builder: Submit vs OpenUrl distinguishable; html visual
// ---------------------------------------------------------------------------

test('d9f85b3c t7 — Submit and OpenUrl stay distinguishable in the card and the table', () => {
	assert.ok(html.includes('<span class="ux-pin">8</span><span class="ux-btn ux-btn--submit">Approve</span>'));
	assert.ok(html.includes('<span class="ux-pin">10</span><span class="ux-btn ux-btn--link" title="./LLD.md">Open source<span class="ux-btn__glyph" aria-hidden="true"> ↗</span></span>'));
	const types = page.description[0]!.rows.slice(7).map(r => r[2]);
	assert.deepEqual(types, ['Action.Submit', 'Action.Submit', 'Action.OpenUrl']);
});

test('d9f85b3c t7 — the visual is HTML with its own card CSS, so the page inlines no Mermaid', () => {
	assert.equal(page.visual.kind, 'html');
	assert.equal(page.kindLabel, 'UX mock');
	assert.equal(page.narrative, S002.narrative);
	const style = page.visual.kind === 'html' ? page.visual.style ?? '' : '';
	assert.match(style, /\.ux-card\{/);
	assert.match(style, /\.ux-pin\{/);
	assert.doesNotMatch(style, /(^|\})body\{/, 'no page-level rules leak into the shell');
	const out = renderCompanionPage(
		{ projectName: 'p', workItemId: 'w', sourceDoc: { id: 'd', href: './d.md' }, date: 'd', user: 'u', contextLine: 'c' },
		page, { panzoom: '/*pz*/', mermaid: '/*MERMAID*/' },
	);
	assert.ok(!out.includes('/*MERMAID*/'));
	assert.doesNotMatch(out, /mermaid\./);
});
