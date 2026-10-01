/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * ISSUE-85e6a58693579b6d S001 / t1 — the UX mock LAYOUT emitter.
 *
 * Every test here asks the same question in a different place: does the element
 * appear as the THING IT DENOTES, or as a label naming its own type? The old
 * renderer answered the second way while a fully green suite watched, which is
 * why these assert on rendered markup rather than on structure.
 *
 * Run: npx tsx --test src/workflow/artifacts/companion/__tests__/ux-mock-render.test.ts
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { renderUxMockDocument } from '../ux.js';
import type { UxDefinition, UxElement } from '../ux.js';

const card = (...body: UxElement[]): UxDefinition => ({ type: 'AdaptiveCard', version: '1.5', body });
const render = (...body: UxElement[]): string => renderUxMockDocument(card(...body), 'UX mock');

/** Just the rendered card region. The full document also carries a stylesheet
 *  (full of class names) and the narrated prose (which legitimately names element
 *  TYPES, since it is an inventory) — so an assertion about what the MOCK shows
 *  must look only here, or it reads the wrong part of the page. */
const cardRegion = (html: string): string =>
  html.slice(html.indexOf('<div class="ux-card">'), html.indexOf('<div class="ux-notes">'));

test('t1: a TextBlock renders its text as CONTENT, not as a \'TextBlock: "…"\' caption', () => {
	const html = render({ type: 'TextBlock', text: 'Pending approval', weight: 'bolder', size: 'large' });
	assert.match(html, /<p class="[^"]*ux-text[^"]*">Pending approval<\/p>/, 'the text is the element’s content');
	// The defect being fixed, asserted as its own absence: the old renderer
	// emitted `TextBlock: "…"` as a node caption.
	assert.doesNotMatch(cardRegion(html), /TextBlock:/, 'the element type is never shown as a caption IN THE MOCK (the prose inventory may name it)');
	assert.match(html, /ux-bolder/, 'weight is expressed visually');
	assert.match(html, /ux-size-large/, 'size is expressed visually');
});

test('t1: an Input.Text renders a LABELLED TEXT CONTROL carrying its label and placeholder', () => {
	const html = render({ type: 'Input.Text', id: 'q', label: 'Query', placeholder: 'search…' });
	assert.match(html, /<span class="ux-label">Query<\/span>/, 'the label is shown as a label');
	assert.match(html, /<span class="ux-input">search…<\/span>/, 'the placeholder sits inside the control');
	assert.doesNotMatch(cardRegion(html), /Input\.Text #/, 'not the old node caption');

	// label falls back to the id rather than rendering an unlabelled control
	assert.match(render({ type: 'Input.Text', id: 'bare' }), /<span class="ux-label">bare<\/span>/);
	// multiline gets a taller control, so the two read differently
	assert.match(render({ type: 'Input.Text', id: 'm', isMultiline: true }), /ux-input--multi/);
});

test('t1: an Input.ChoiceSet renders a labelled control listing EVERY choice title', () => {
	const html = render({
		type: 'Input.ChoiceSet', id: 'sev', label: 'Severity', isMultiSelect: false,
		choices: [{ title: 'HIGH', value: 'h' }, { title: 'MED', value: 'm' }, { title: 'LOW', value: 'l' }],
	});
	assert.match(html, /<span class="ux-label">Severity<\/span>/);
	for (const t of ['HIGH', 'MED', 'LOW']) assert.ok(html.includes(`>${t}</span>`), `choice ${t} is rendered`);
	assert.equal((html.match(/ux-choice"/g) ?? []).length, 3, 'one control per choice, none dropped');
	// single-select and multi-select read differently
	const multi = render({ type: 'Input.ChoiceSet', id: 'm', choices: [{ title: 'A', value: 'a' }], isMultiSelect: true });
	const mark = (h: string): string => {
		const r = /ux-choice__mark"[^>]*>([^<]+)</.exec(cardRegion(h));
		return r?.[1] ?? '';
	};
	assert.notEqual(mark(html), '', 'a choice carries a visible mark');
	assert.notEqual(mark(html), mark(multi), 'a multi-select choice is visually distinct from a single-select one');
});

test('t1: an ActionSet renders ONE BUTTON PER ACTION, with Submit and OpenUrl DISTINGUISHABLE', () => {
	const html = render({
		type: 'ActionSet',
		actions: [
			{ type: 'Action.Submit', title: 'Approve' },
			{ type: 'Action.OpenUrl', title: 'Open doc', url: 'https://example.invalid/d' },
		],
	});
	assert.equal((html.match(/class="ux-btn /g) ?? []).length, 2, 'one button per action');
	assert.match(html, /ux-btn--submit">Approve/, 'the submit renders as a submit');
	assert.match(html, /ux-btn--link"[^>]*>Open doc/, 'the navigation renders differently');
	// THE POINT: the two action types must be tellable apart. labelFor joined only
	// the titles, so both collapsed into one indistinguishable string.
	assert.notEqual(
		(html.match(/class="ux-btn (ux-btn--\w+)"/) ?? [])[1],
		(html.match(/class="ux-btn (ux-btn--\w+)"[^>]*>Open doc/) ?? [])[1],
		'submit and open-url do not share a class',
	);
});

test('t1: an Image renders a LABELLED PLACEHOLDER carrying url and altText, and is NEVER fetched', () => {
	const html = render({ type: 'Image', url: 'https://example.invalid/p.png', altText: 'a diagram', size: 'medium' });
	assert.match(html, /class="ux-image"/, 'rendered as a placeholder');
	assert.match(html, /a diagram/, 'altText is shown');
	assert.match(html, /https:\/\/example\.invalid\/p\.png/, 'the url is shown');
	// The no-network invariant at its sharpest: an image is the one element a
	// renderer would naturally reach out for.
	assert.doesNotMatch(html, /<img\b/, 'no img element is emitted');
	assert.doesNotMatch(html, /src=/, 'nothing is given a src');
});

test('t1: a Container renders a visibly grouped region CONTAINING its children', () => {
	const html = render({
		type: 'Container',
		items: [{ type: 'TextBlock', text: 'inside' }, { type: 'Input.Text', id: 'i', label: 'Field' }],
	});
	const m = /<div class="ux-container">([\s\S]*?)<\/div>\s*<\/div>\s*<div class="ux-notes">/.exec(html)
		?? /<div class="ux-container">([\s\S]*)/.exec(html);
	assert.ok(m, 'a container region is emitted');
	assert.match(html, /ux-container/, 'the group is visible as a region');
	// containment, not adjacency: the child markup sits INSIDE the container div
	const region = cardRegion(html);
	const start = region.indexOf('<div class="ux-container">');
	assert.ok(region.indexOf('inside') > start, 'the child renders within the container');
	assert.ok(region.indexOf('Field') > start, 'every child renders within the container');
});

test('t1: a ColumnSet renders its Columns SIDE BY SIDE rather than stacked', () => {
	const html = render({
		type: 'ColumnSet',
		columns: [
			{ type: 'Column', items: [{ type: 'TextBlock', text: 'left' }] },
			{ type: 'Column', items: [{ type: 'TextBlock', text: 'right' }] },
		],
	});
	assert.match(html, /class="ux-columnset"/);
	assert.equal((html.match(/class="ux-column"/g) ?? []).length, 2, 'both columns render');
	// side-by-side is a LAYOUT claim, so assert the rule that creates it
	assert.match(html, /\.ux-columnset\{display:flex/, 'the column set lays out horizontally');
	assert.ok(html.indexOf('left') < html.indexOf('right'), 'column order is preserved');
});

test('t1: a Column renders as a region inside its ColumnSet, preserving its width hint', () => {
	const html = render({
		type: 'ColumnSet',
		columns: [
			{ type: 'Column', width: 2, items: [{ type: 'TextBlock', text: 'wide' }] },
			{ type: 'Column', width: 'stretch', items: [{ type: 'TextBlock', text: 'auto' }] },
		],
	});
	assert.match(html, /class="ux-column" style="flex:2 1 0"/, 'a numeric width becomes a flex weight');
	assert.match(html, /class="ux-column" style="flex:1 1 0"/, 'a non-numeric width falls back to an even share');
	const region = cardRegion(html);
	assert.ok(region.indexOf('class="ux-column"') > region.indexOf('class="ux-columnset"'), 'columns nest inside the set');
});

test('t1: source-scan — the element switch is EXHAUSTIVE over UxElement, so a ninth variant fails the build', () => {
	const src = readFileSync(join(import.meta.dirname, '..', 'ux.ts'), 'utf8');
	const fn = src.slice(src.indexOf('function elementHtml'));
	// The guarantee must live in THIS function, not be borrowed from labelFor /
	// roleOf on the now-dead IR path — those are the code most likely to be
	// deleted once the companion stops using the graph lowering.
	assert.match(fn.slice(0, 4000), /const unhandled: never = el;/,
		'elementHtml asserts exhaustiveness itself via a never-assignment');
	for (const variant of ['TextBlock', 'Container', 'ColumnSet', 'Column', 'Image', 'Input.Text', 'Input.ChoiceSet', 'ActionSet']) {
		assert.ok(fn.includes(`case '${variant}'`), `the switch handles ${variant}`);
	}
});

test('t1: an element OUTSIDE the union emits a VISIBLE placeholder naming that type, siblings intact', () => {
	const rogue = { type: 'Hologram', text: 'from the future' } as unknown as UxElement;
	const html = render({ type: 'TextBlock', text: 'before' }, rogue, { type: 'TextBlock', text: 'after' });

	assert.match(html, /class="ux-unknown"/, 'a visible placeholder is emitted');
	assert.match(html, /unrenderable element: Hologram/, 'and it names the type that could not be drawn');
	// Never a silent hole: the reviewer must not approve a design missing a piece.
	assert.ok(html.includes('before') && html.includes('after'), 'both siblings still render');
	const region = cardRegion(html);
	assert.ok(region.indexOf('before') < region.indexOf('ux-unknown'), 'the placeholder holds the element’s position');
	assert.ok(region.indexOf('ux-unknown') < region.indexOf('after'));
});

test('t1: an unrecognised element never THROWS and never silently disappears', () => {
	const rogue = { type: 'Nope' } as unknown as UxElement;
	assert.doesNotThrow(() => render(rogue));
	const html = render(rogue);
	assert.ok(html.length > 0 && html.includes('ux-unknown'), 'it is rendered, not skipped');
	// an element with no type at all still degrades rather than crashing
	assert.doesNotThrow(() => render({} as unknown as UxElement));
});

test('t1: a Container whose items is MALFORMED renders an empty group and the rest survives', () => {
	const bad = { type: 'Container', items: 'not-an-array' } as unknown as UxElement;
	const html = render({ type: 'TextBlock', text: 'kept' }, bad, { type: 'TextBlock', text: 'also kept' });

	assert.match(html, /class="ux-container">\s*<\/div>/, 'the malformed container renders as an empty region');
	assert.ok(html.includes('kept') && html.includes('also kept'), 'the surrounding card survives');
	assert.doesNotThrow(() => render({ type: 'Container' } as unknown as UxElement), 'absent items does not throw');
});

test('t1: text containing HTML metacharacters renders as LITERAL TEXT, everywhere it can appear', () => {
	const nasty = '<script>alert(1)</script> & "quoted" \'single\'';
	const html = renderUxMockDocument(card(
		{ type: 'TextBlock', text: nasty },
		{ type: 'Input.ChoiceSet', id: 'c', label: nasty, choices: [{ title: nasty, value: 'v' }] },
		{ type: 'ActionSet', actions: [{ type: 'Action.Submit', title: nasty }] },
		{ type: 'Image', url: 'https://example.invalid/x', altText: nasty },
	), nasty);

	// Authored content is DATA: a card can never inject structure into its own mock.
	assert.doesNotMatch(html, /<script>alert/, 'no live script tag survives anywhere');
	assert.match(html, /&lt;script&gt;/, 'the metacharacters are escaped instead');
	assert.ok(html.includes('&amp;'), 'ampersands are escaped');
	// and the title takes the same treatment
	assert.doesNotMatch(html, /<title>[^<]*<script>/, 'the document title is escaped too');
});

test('t1: the emitter is PURE — the same definition yields a byte-identical string', () => {
	const def = card(
		{ type: 'TextBlock', text: 'x' },
		{ type: 'ColumnSet', columns: [{ type: 'Column', items: [{ type: 'Input.Text', id: 'i' }] }] },
		{ type: 'ActionSet', actions: [{ type: 'Action.Submit', title: 'Go' }] },
	);
	const first = renderUxMockDocument(def, 'T');
	for (let i = 0; i < 5; i++) assert.equal(renderUxMockDocument(def, 'T'), first, 'deterministic across calls');
	// no IO, no runtime, no remote anything
	assert.doesNotMatch(first, /https?:\/\//, 'the document references no remote origin');
	assert.doesNotMatch(first, /<script/, 'no script is emitted — rendering is build-time');
	assert.doesNotMatch(first, /<link\b/, 'no external stylesheet');
});

test('t1: renderUxCompanion is NOT yet changed — t1 adds the emitter and wires nothing', () => {
	const src = readFileSync(join(import.meta.dirname, '..', 'render.ts'), 'utf8');
	assert.match(src, /await assembleShell\(ir\)/, 'the companion still uses the old pipeline at this task');
	assert.doesNotMatch(src, /renderUxMockDocument/, 'nothing calls the new emitter yet');
});
