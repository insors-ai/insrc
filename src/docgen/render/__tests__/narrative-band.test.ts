/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * S001 (enrich-docgen-generated-companion-html-artifacts) — the shared narrated
 * band: the source-link render, escape/no-injection, byte-identity for the
 * no-context case, and primary/fallback parity.
 *
 * Run: npx tsx --test src/docgen/render/__tests__/narrative-band.test.ts
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { renderNarrativeBand } from '../narrative.js';
import { assembleFallbackShell } from '../fallback.js';
import type { DocumentIR, IrSection } from '../../types.js';

const SECTIONS: readonly IrSection[] = [
	{ id: 'purpose', title: 'Purpose', narrativeText: 'what this shows' },
	{ id: 'legend', title: 'Legend', narrativeText: 'the key' },
];

function irWith(sections: readonly IrSection[], sourceLink?: { label: string; href: string }): DocumentIR {
	return {
		docType: 'er',
		scopeDescription: 'ER model: X',
		derived: { nodes: [], edges: [] },
		narrated: sourceLink === undefined ? { sections } : { sections, sourceLink },
		generatedAtRevision: 'authored-er',
	};
}

// ── renderNarrativeBand (t2 unit) ───────────────────────────────────────────

test('renderNarrativeBand: empty sections AND no sourceLink → "" (byte-identity anchor)', () => {
	assert.equal(renderNarrativeBand([]), '');
	assert.equal(renderNarrativeBand([], undefined), '');
});

test('renderNarrativeBand: a sections-only band is unchanged (no link element)', () => {
	const out = renderNarrativeBand(SECTIONS);
	assert.match(out, /id="docgen-narrative"/);
	assert.match(out, /<h3 style="margin:.2rem 0">Purpose<\/h3>/);
	assert.doesNotMatch(out, /<a /);   // no source-link element when none supplied
});

test('renderNarrativeBand: a sourceLink renders an escaped <a> in the band', () => {
	const out = renderNarrativeBand(SECTIONS, { label: 'View the source document (LLD.md)', href: './LLD.md' });
	assert.match(out, /<a href="\.\/LLD\.md" style="color:#4051b5">View the source document \(LLD\.md\)<\/a>/);
});

test('renderNarrativeBand: a sourceLink with no sections still renders the band', () => {
	const out = renderNarrativeBand([], { label: 'src', href: './HLD.md' });
	assert.notEqual(out, '');
	assert.match(out, /href="\.\/HLD\.md"/);
});

test('renderNarrativeBand: label + href are escaped — no markup injection', () => {
	const out = renderNarrativeBand(
		[{ id: 's', title: 'a < b & c', narrativeText: 'x < y' }],
		{ label: '<script>x</script>', href: './a".md' },
	);
	assert.doesNotMatch(out, /<script>x<\/script>/);         // label escaped
	assert.match(out, /&lt;script&gt;x&lt;\/script&gt;/);
	assert.match(out, /href="\.\/a&quot;\.md"/);              // quote in href escaped → cannot break out
	assert.match(out, /a &lt; b &amp; c/);                   // section title escaped
});

// ── assembleFallbackShell parity (t3 unit) ──────────────────────────────────

const SVG = '<svg xmlns="http://www.w3.org/2000/svg"><g/></svg>';

test('assembleFallbackShell: renders the SAME narrated band + source link as the primary shell (parity)', () => {
	const ir = irWith(SECTIONS, { label: 'View the source document (HLD.md)', href: './HLD.md' });
	const shell = assembleFallbackShell(ir, SVG, '/* svgPanZoom */', '1.0.0');
	assert.match(shell.html, /id="docgen-narrative"/);
	assert.match(shell.html, /<h3 style="margin:.2rem 0">Purpose<\/h3>/);
	assert.match(shell.html, /<a href="\.\/HLD\.md"[^>]*>View the source document \(HLD\.md\)<\/a>/);
	// still offline: the only http(s) is the SVG namespace, never a fetched asset/link.
	assert.doesNotMatch(shell.html, /href="https?:/);
	assert.doesNotMatch(shell.html, /src="https?:/);
});

test('assembleFallbackShell: empty sections + no sourceLink → no band (byte-identity to pre-S001)', () => {
	const ir = irWith([]);
	const shell = assembleFallbackShell(ir, SVG, '/* svgPanZoom */', '1.0.0');
	assert.doesNotMatch(shell.html, /docgen-narrative/);
	// the diagram div keeps its full-height default (no inline height style).
	assert.match(shell.html, /<div id="docgen-diagram">/);
});
