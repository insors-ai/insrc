/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * LLD-d9f85b3c S001/t3 — the companion page shell.
 *
 * Run:
 *   npx tsx --test src/workflow/artifacts/companion/__tests__/shell.test.ts
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
	_setCompanionRuntimeDirsForTests, loadCompanionRuntime, renderCompanionPage,
	type CompanionPageContent, type CompanionRuntime,
} from '../shell.js';
import { DiagramGenerationError } from '../render.js';
import type { CompanionHeader } from '../types.js';

const HEADER: CompanionHeader = {
	projectName: 'insrc',
	workItemId:  'E20261011d9f85b3c:S001',
	sourceDoc:   { id: 'LLD-d9f85b3cc8cc966b-S001', href: './LLD.md' },
	date:        '2026-10-11 14:32',
	user:        'Subho Ghosh',
	contextLine: 'Standalone story S001 · Companion pages share one template.',
};

/** Stand-in runtimes: recognisable markers, no URLs. */
const RUNTIME_MERMAID: CompanionRuntime = { panzoom: '/*PANZOOM*/', mermaid: '/*MERMAID*/' };
const RUNTIME_HTML: CompanionRuntime = { panzoom: '/*PANZOOM*/' };

const MERMAID_PAGE: CompanionPageContent = {
	title: 'Order data model',
	kindLabel: 'Entity–relationship model',
	narrative: 'Customers place orders.\n\nEach order has lines.',
	visual: { kind: 'mermaid', source: 'erDiagram\n  CUSTOMER ||--o{ ORDER : places' },
	description: [{ heading: 'Entities', lead: 'Two entities.', columns: ['Entity', 'Description'], rows: [['CUSTOMER', 'A buyer.'], ['ORDER', null]] }],
};

const HTML_PAGE: CompanionPageContent = {
	title: 'Sign-in screen',
	kindLabel: 'UX mock',
	visual: { kind: 'html', html: '<div class="ux-card">card</div>', style: '.ux-card{width:640px}' },
	description: [{ columns: ['#', 'Element'], rows: [[{ tag: 'marker', text: '1' }, 'Email field']] }],
};

/** The page with its inlined <script> bodies removed: what the shell itself wrote. */
function shellMarkup(html: string): string {
	return html.replace(/<script>[\s\S]*?<\/script>/g, '<script></script>');
}

// ---------------------------------------------------------------------------
// unit: shell: section order + header table rows + no external URL
// ---------------------------------------------------------------------------

test('d9f85b3c t3 — Header, Narrative, View and Description appear in that order', () => {
	const html = renderCompanionPage(HEADER, MERMAID_PAGE, RUNTIME_MERMAID);
	const at = (needle: string): number => { const i = html.indexOf(needle); assert.ok(i >= 0, `missing ${needle}`); return i; };
	const order = [at('<header class="hdr">'), at('<h2>Narrative</h2>'), at('<h2>View</h2>'), at('<h2>Description</h2>')];
	assert.deepEqual([...order].sort((a, b) => a - b), order);
	assert.match(html, /<div class="proj">insrc<\/div><h1>Order data model<\/h1><span class="kind">Entity–relationship model<\/span>/);
});

test('d9f85b3c t3 — the header table has the four rows: Work item, Source doc (linked), Date, User', () => {
	const html = renderCompanionPage(HEADER, MERMAID_PAGE, RUNTIME_MERMAID);
	const rows = [...html.matchAll(/<tr><th>([^<]+)<\/th><td>(.*?)<\/td><\/tr>/g)].map(m => [m[1], m[2]]);
	assert.deepEqual(rows, [
		['Work item', 'E20261011d9f85b3c:S001'],
		['Source doc', '<a href="./LLD.md">LLD-d9f85b3cc8cc966b-S001</a>'],
		['Date', '2026-10-11 14:32'],
		['User', 'Subho Ghosh'],
	]);
});

test('d9f85b3c t3 — no http(s) URL appears: none in the shell markup, none at all on an HTML page', () => {
	for (const html of [renderCompanionPage(HEADER, MERMAID_PAGE, RUNTIME_MERMAID), renderCompanionPage(HEADER, HTML_PAGE, RUNTIME_HTML)]) {
		assert.doesNotMatch(shellMarkup(html), /https?:\/\//);
		assert.doesNotMatch(html, /<(script|link|img)[^>]+(src|href)=/i, 'nothing is loaded from elsewhere');
	}
	assert.doesNotMatch(renderCompanionPage(HEADER, HTML_PAGE, RUNTIME_HTML), /https?:\/\//);
});

// ---------------------------------------------------------------------------
// unit: shell view panel: toolbar controls, pan/zoom init, fit-on-load for mermaid and html visuals; html page has no Mermaid
// ---------------------------------------------------------------------------

test('d9f85b3c t3 — both visuals get the toolbar, the pan/zoom runtime and its init', () => {
	for (const [page, runtime] of [[MERMAID_PAGE, RUNTIME_MERMAID], [HTML_PAGE, RUNTIME_HTML]] as const) {
		const html = renderCompanionPage(HEADER, page, runtime);
		for (const id of ['zout', 'zl', 'zin', 'zfit', 'z100', 'vp', 'stage']) assert.match(html, new RegExp(`id="${id}"`), id);
		assert.ok(html.includes('<script>/*PANZOOM*/</script>'), 'the pan/zoom runtime is inlined');
		assert.match(html, /window\.insrcPanZoom\.init\(\{viewport:'vp',stage:'stage',zoomLabel:'zl',zoomIn:'zin',zoomOut:'zout',fit:'zfit',reset:'z100'/);
	}
});

test('d9f85b3c t3 — a Mermaid page inlines Mermaid and fits once the diagram is drawn', () => {
	const html = renderCompanionPage(HEADER, MERMAID_PAGE, RUNTIME_MERMAID);
	assert.ok(html.includes('<script>/*MERMAID*/</script>'));
	assert.ok(html.indexOf('/*MERMAID*/') < html.indexOf('mermaid.run('), 'the runtime loads before it is used');
	assert.match(html, /mermaid\.run\(\{querySelector:'#stage pre\.mermaid'\}\)\.then\(function\(\)\{.*pz\.fit\(\);/s);
	assert.match(html, /<pre class="mermaid">erDiagram\n  CUSTOMER \|\|--o\{ ORDER : places<\/pre>/);
});

test('d9f85b3c t3 — an HTML page inlines no Mermaid, fits on load and carries the visual and its CSS', () => {
	const html = renderCompanionPage(HEADER, HTML_PAGE, { panzoom: '/*PANZOOM*/', mermaid: '/*MERMAID*/' });
	assert.ok(!html.includes('/*MERMAID*/'), 'Mermaid is not inlined even when supplied');
	assert.doesNotMatch(html, /mermaid\./);
	assert.match(html, /fitOnLoad:true/);
	assert.ok(html.includes('<div class="stage" id="stage"><div class="ux-card">card</div></div>'));
	assert.ok(html.includes('.ux-card{width:640px}</style>'));
});

test('d9f85b3c t3 — an inlined runtime cannot close its script element early', () => {
	const html = renderCompanionPage(HEADER, HTML_PAGE, { panzoom: 'var s="</script><b>";' });
	assert.ok(html.includes('var s="<\\/script><b>";'));
});

// ---------------------------------------------------------------------------
// unit: shell: escaping of all table text; null cell -> em dash; missing narrative renders only the context line
// ---------------------------------------------------------------------------

test('d9f85b3c t3 — every header, narrative and table string is escaped', () => {
	const evil = '<img src=x onerror="alert(1)">&\'';
	const enc = '&lt;img src=x onerror=&quot;alert(1)&quot;&gt;&amp;&#39;';
	const header: CompanionHeader = {
		projectName: evil, workItemId: evil, sourceDoc: { id: evil, href: `./${evil}` }, date: evil, user: evil, contextLine: evil,
	};
	const page: CompanionPageContent = {
		title: evil, kindLabel: evil, narrative: evil, visual: { kind: 'mermaid', source: evil },
		description: [{ heading: evil, lead: evil, columns: [evil], rows: [[evil], [{ tag: 'fk', text: evil }]] }],
	};
	const markup = shellMarkup(renderCompanionPage(header, page, RUNTIME_MERMAID));
	assert.ok(!markup.includes('<img'), 'no raw markup survives');
	assert.ok(!markup.includes('onerror="'), 'no attribute breaks out');
	// Each place a string is written carries it escaped.
	const count = markup.split(enc).length - 1;
	assert.ok(count >= 14, `expected every occurrence escaped, found ${count}`);
});

test('d9f85b3c t3 — a null cell renders as an em dash, and a tagged cell as its badge', () => {
	const html = renderCompanionPage(HEADER, MERMAID_PAGE, RUNTIME_MERMAID);
	assert.ok(html.includes('<tr><td>ORDER</td><td class="missing">—</td></tr>'));
	const ux = renderCompanionPage(HEADER, HTML_PAGE, RUNTIME_HTML);
	assert.ok(ux.includes('<td><span class="pin">1</span></td>'));
});

test('d9f85b3c t3 — a missing narrative renders only the context line; a present one renders its paragraphs', () => {
	const without = renderCompanionPage(HEADER, HTML_PAGE, RUNTIME_HTML);
	assert.match(without, /<h2>Narrative<\/h2><p class="context">Standalone story S001 · Companion pages share one template\.<\/p><\/section>/);
	const withIt = renderCompanionPage(HEADER, MERMAID_PAGE, RUNTIME_MERMAID);
	assert.match(withIt, /<p class="context">[^<]*<\/p><p>Customers place orders\.<\/p><p>Each order has lines\.<\/p><\/section>/);
});

// ---------------------------------------------------------------------------
// unit: shell runtime loader: missing asset -> DiagramGenerationError
// ---------------------------------------------------------------------------

test('d9f85b3c t3 — the runtime loader reads the shipped assets: pan/zoom always, Mermaid for a Mermaid visual only', () => {
	_setCompanionRuntimeDirsForTests(undefined);
	const html = loadCompanionRuntime('html');
	assert.match(html.panzoom, /window\.insrcPanZoom/);
	assert.equal(html.mermaid, undefined);
	const mermaid = loadCompanionRuntime('mermaid');
	assert.ok((mermaid.mermaid ?? '').length > 100_000, 'the vendored Mermaid bundle');
});

test('d9f85b3c t3 — a missing runtime asset raises DiagramGenerationError', () => {
	const dir = mkdtempSync(join(tmpdir(), 'insrc-shell-rt-'));
	try {
		_setCompanionRuntimeDirsForTests({ companion: dir, mermaid: dir });
		assert.throws(() => loadCompanionRuntime('html'), (e: unknown) => e instanceof DiagramGenerationError && /panzoom\.js/.test((e as Error).message));
		writeFileSync(join(dir, 'panzoom.js'), '/*pz*/');
		assert.doesNotThrow(() => loadCompanionRuntime('html'), 'an HTML page needs no Mermaid');
		assert.throws(() => loadCompanionRuntime('mermaid'), (e: unknown) => e instanceof DiagramGenerationError && /mermaid\.min\.js/.test((e as Error).message));
	} finally {
		_setCompanionRuntimeDirsForTests(undefined);
		rmSync(dir, { recursive: true, force: true });
	}
});
