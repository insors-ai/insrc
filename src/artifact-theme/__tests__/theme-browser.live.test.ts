/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * LLD-7c5a1921cb45a8d8 S001 — live check of the artifact page theme in a real
 * browser: a generated companion page and a docgen page open in light, switch to
 * a dark body that fills the window over an unpainted html element (so the body
 * background paints the whole canvas), keep the theme switch fixed at the top
 * right clear of the header, fit a 360px window, and show no font text.
 *
 * Gated like the repo's other live checks: runs only with INSRC_LIVE_TESTS=1 and
 * a Chrome binary on PATH (google-chrome, chromium or chromium-browser), and
 * skips cleanly otherwise.
 *
 *   INSRC_LIVE_TESTS=1 npx tsx --test src/artifact-theme/__tests__/theme-browser.live.test.ts
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { finalizeArtifact } from '../../workflow/orchestrator.js';
import type { WorkflowIntent } from '../../workflow/types.js';
import type { LldArtifact } from '../../workflow/artifacts/lld.js';
import { assembleShell } from '../../docgen/render/shell.js';
import { isOk } from '../../docgen/outcome.js';
import type { DocumentIR } from '../../docgen/types.js';

function chromeBinary(): string | undefined {
	for (const bin of ['google-chrome', 'chromium', 'chromium-browser']) {
		if (spawnSync(bin, ['--version'], { stdio: 'ignore' }).status === 0) return bin;
	}
	return undefined;
}

const CHROME = process.env['INSRC_LIVE_TESTS'] === '1' ? chromeBinary() : undefined;

interface Probe {
	readonly light: { readonly theme: string | null; readonly bodyBg: string };
	readonly dark: { readonly theme: string | null; readonly bodyBg: string; readonly htmlBg: string; readonly bodyHeight: number; readonly innerHeight: number };
	readonly button: { readonly position: string; readonly top: number; readonly right: number; readonly innerWidth: number; readonly topAfterScroll: number; readonly bottomAboveHeader: boolean; readonly parentIsBody: boolean };
	readonly scrollWidth: number;
	readonly innerWidth?: number;
	readonly refRight: number | null;
	readonly wide?: string;
	readonly fontText: boolean;
}

/** The probe appended to a page: runs after the diagram has drawn and writes its findings into #probe. */
const PROBE = `
<div style="height:3000px"></div>
<pre id="probe"></pre>
<script>
setTimeout(function(){
  var b=document.body,h=document.documentElement,btn=document.getElementById('iv-theme');
  var light={theme:b.getAttribute('data-theme'),bodyBg:getComputedStyle(b).backgroundColor};
  window.insrcViewer.setMode('dark');
  var dark={theme:b.getAttribute('data-theme'),bodyBg:getComputedStyle(b).backgroundColor,htmlBg:getComputedStyle(h).backgroundColor,bodyHeight:b.getBoundingClientRect().height,innerHeight:window.innerHeight};
  var r0=btn.getBoundingClientRect();
  var hdr=document.querySelector('header.hdr,.iv-bar');
  var above=hdr?r0.bottom<=hdr.getBoundingClientRect().top+0.5:true;
  window.scrollTo(0,300);
  var r1=btn.getBoundingClientRect();
  var out={light:light,dark:dark,button:{position:getComputedStyle(btn).position,top:r0.top,right:r0.right,innerWidth:window.innerWidth,topAfterScroll:r1.top,bottomAboveHeader:above,parentIsBody:btn.parentElement===b},scrollWidth:h.scrollWidth,refRight:(function(){var t=document.querySelector('table.ref');return t?t.getBoundingClientRect().right:null;})(),innerWidth:window.innerWidth,wide:Array.prototype.filter.call(document.body.querySelectorAll('*'),function(e){return e.getBoundingClientRect().right>window.innerWidth+1;}).slice(0,6).map(function(e){return e.tagName+'.'+e.className+'#'+e.id+':'+Math.round(e.getBoundingClientRect().right);}).join(' '),fontText:/@font-face/.test(b.innerText)};
  document.getElementById('probe').textContent=JSON.stringify(out);
},4000);
</script>`;

/**
 * Load a page headless at the given width, run the probe and return its findings.
 * Headless Chrome will not open a window narrower than 500px, so a narrower width is
 * measured inside an iframe of that width, where media queries follow the frame.
 */
function probePage(bin: string, html: string, width: number, dir: string): Probe {
	const file = join(dir, `page-${width}.html`);
	// the inlined runtimes may contain the text '</body>': append before the LAST one
	const end = html.lastIndexOf('</body>');
	writeFileSync(file, `${html.slice(0, end)}${PROBE}${html.slice(end)}`);
	let target = file;
	if (width < 500) {
		target = join(dir, `frame-${width}.html`);
		writeFileSync(target, `<!doctype html><body style="margin:0"><iframe id="f" src="page-${width}.html" style="width:${width}px;height:800px;border:0"></iframe><pre id="probe"></pre><script>setTimeout(function(){document.getElementById('probe').textContent=document.getElementById('f').contentDocument.getElementById('probe').textContent;},9000);</script></body>`);
	}
	const r = spawnSync(bin, [
		'--headless=new', '--no-sandbox', '--disable-gpu', '--virtual-time-budget=16000', '--allow-file-access-from-files',
		`--window-size=${Math.max(width, 500)},900`, `--user-data-dir=${join(dir, `profile-${width}`)}`,
		'--dump-dom', `file://${target}`,
	], { encoding: 'utf8', timeout: 90_000, maxBuffer: 128 * 1024 * 1024 });
	const m = /<pre id="probe">([\s\S]*?)<\/pre>/.exec(r.stdout ?? '');
	assert.ok(m !== null && (m[1] ?? '') !== '', 'the probe wrote its findings');
	return JSON.parse((m?.[1] ?? '').replace(/&quot;/g, '"').replace(/&amp;/g, '&')) as Probe;
}

function assertThemed(p: Probe, label: string, narrow: boolean): void {
	assert.equal(p.light.theme, 'light', `${label}: opens in light`);
	assert.equal(p.light.bodyBg, 'rgb(255, 255, 255)', `${label}: light body background`);
	assert.equal(p.dark.theme, 'dark', `${label}: switches to dark`);
	assert.notEqual(p.dark.bodyBg, 'rgb(255, 255, 255)', `${label}: dark body background`);
	assert.equal(p.dark.htmlBg, 'rgba(0, 0, 0, 0)', `${label}: html has no background of its own, so the body background paints the canvas`);
	assert.ok(p.dark.bodyHeight >= p.dark.innerHeight - 1, `${label}: the body fills the window`);
	assert.equal(p.button.position, 'fixed', `${label}: the switch floats`);
	assert.ok(p.button.parentIsBody, `${label}: the switch is a child of the body`);
	assert.ok(Math.abs(p.button.top - 12) < 1 && p.button.right <= p.button.innerWidth && p.button.right >= p.button.innerWidth - 40, `${label}: top right of the window`);
	assert.ok(Math.abs(p.button.topAfterScroll - 12) < 1, `${label}: stays put while scrolling`);
	assert.ok(p.button.bottomAboveHeader, `${label}: clear of the header at scroll zero`);
	assert.equal(p.fontText, false, `${label}: no font text on the page`);
	if (narrow) assert.ok(p.refRight !== null && p.refRight <= 360, `${label}: the header table fits a 360px window (right edge ${p.refRight}, wide: ${p.wide})`);
}

const body = {
	summary: { prose: 'Orders belong to customers.' },
	hldContextSlice: { frameworkSummary: 'standalone', ownedContracts: [], consumedContracts: [], boundary: { storyId: 's1', owns: [], depends: [], internal: 'Orders' }, adjacentBoundaries: [], rolloutPhase: 'standalone', nonFunctional: {} },
	contractDetails: { surfaceLevel: 'internal', api: [] },
	dataModelChanges: [], interactionWithShared: [],
	errorPaths: { errorCases: [], edgeCases: [], invariantsToPreserve: [] },
	testStrategy: { testLevels: [], acceptanceMapping: [], testFramework: 'node:test' },
	alternativesConsidered: [{ id: 'a1', name: 'n', oneLineSummary: 'x', approach: 'x', pros: ['x'], cons: ['x'], costEstimate: 'S' }],
	chosenAlternative: 'a1', openQuestions: [],
	erDefinition: { narrative: 'Orders belong to customers.', classes: {
		Customer: { description: 'A buyer.', attributes: { id: { range: 'string', identifier: true } } },
		Order: { attributes: { id: { range: 'string', identifier: true }, customer: { range: 'Customer', required: true } } },
	} },
};

if (CHROME === undefined) {
	test('theme-browser.live: skipped (set INSRC_LIVE_TESTS=1 with Chrome installed)', { skip: true }, () => {});
} else {
	test('theme-browser.live: a generated ER companion page is light by default, dark on the switch, with the switch floating top right, at desktop and 360px', async () => {
		const repo = mkdtempSync(join(tmpdir(), 'theme-browser-'));
		try {
			const intent = {
				workflow: 'design.story', focus: 'orders', repoPath: repo, repoIndexedAt: null,
				params: { standalone: true, epicHash: 'b7c3d1e2f3a4b5c6', storyId: 's1', sizeClass: 'feature', storyTitle: 'Order intake screen' },
			} as unknown as WorkflowIntent;
			const result = await finalizeArtifact(intent, {}, 'wf-theme', 5, { body, citations: [{ id: 'c1', kind: 'code', ref: 'src/x.ts' }] }, 'client');
			assert.equal(result.ok, true);
			if (!result.ok) return;
			const refs = (result.finalized.artifact as LldArtifact).body.companions ?? [];
			const er = refs.map(r => join(repo, r.relPath)).find(f => readFileSync(f, 'utf8').includes('erDiagram'));
			assert.ok(er !== undefined, 'an ER companion page was written');
			const html = readFileSync(er, 'utf8');
			assertThemed(probePage(CHROME, html, 1280, repo), 'companion 1280px', false);
			assertThemed(probePage(CHROME, html, 360, repo), 'companion 360px', true);
		} finally { rmSync(repo, { recursive: true, force: true }); }
	});

	test('theme-browser.live: a generated docgen page is light by default, dark on the switch, with the switch floating top right', async () => {
		const dir = mkdtempSync(join(tmpdir(), 'theme-browser-docgen-'));
		try {
			const ir: DocumentIR = {
				docType: 'component-dependency', scopeDescription: 'repo',
				derived: { nodes: [{ id: 'a', label: 'A', kind: 'component' }, { id: 'b', label: 'B', kind: 'component' }], edges: [{ id: 'a:depends:b', from: 'a', to: 'b', kind: 'depends' }] },
				narrated: { sections: [] }, generatedAtRevision: 'r1',
			};
			const out = await assembleShell(ir);
			assert.ok(isOk(out));
			if (!isOk(out)) return;
			assertThemed(probePage(CHROME, out.value.html, 1280, dir), 'docgen 1280px', false);
		} finally { rmSync(dir, { recursive: true, force: true }); }
	});
}
