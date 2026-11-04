/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Story E20261030486751c3:S001 (t5) — viewer behavior: the inlined boot script
 * must parse, the panzoom runtime asset must parse, the readable-scale clamp
 * must be wired, theme switch must re-run the SAME source, and the diagram
 * source must be preserved verbatim in the artifact (NFR4).
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, mkdtempSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

import { mermaidConfigFor, viewerBootScript } from '../theme.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = join(HERE, '..', '..', '..');

function nodeCheck(code: string): void {
	const dir = mkdtempSync(join(tmpdir(), 'iv-boot-'));
	const f = join(dir, 'boot.js');
	writeFileSync(f, code);
	execFileSync(process.execPath, ['--check', f]);
}

test('viewer-script.test.ts: the generated boot script parses (node --check)', () => {
	const boot = viewerBootScript({ initialMode: 'light', configs: { light: mermaidConfigFor('light'), dark: mermaidConfigFor('dark') } });
	nodeCheck(boot);
});

test('viewer-script.test.ts: the shipped panzoom runtime parses and exposes the readable-fit floor + transform accessors', () => {
	const panzoom = readFileSync(join(REPO, 'src', 'assets', 'artifacts', 'companion', 'panzoom.js'), 'utf8');
	nodeCheck(panzoom);
	assert.match(panzoom, /minFitScale/, 'minFitScale option accepted');
	assert.match(panzoom, /Math\.max\(Math\.min\(Math\.min\(W \/ w, H \/ h\) \* FIT_MARGIN, MAX_FIT_SCALE\), MIN_FIT\)/, 'fit clamps at the readable floor');
	assert.match(panzoom, /zoomTo: zoomTo, getT: getT, setT: setT/, 'transform accessors exposed for theme-switch restore');
});

test('viewer-script.test.ts: boot keeps the diagram source verbatim and the readable clamp, and re-runs the same source on theme switch', () => {
	const boot = viewerBootScript({ initialMode: 'dark', configs: { light: mermaidConfigFor('light'), dark: mermaidConfigFor('dark') } });
	assert.match(boot, /MIN_SCALE=0\.8/);
	assert.match(boot, /Math\.max\(fit,MIN_SCALE\)/, 'initial scale never drops labels below 16px');
	assert.match(boot, /Math\.min\(1,/, 'capped at natural size for small diagrams');
	assert.match(boot, /var keep=getTransform\(\);/, 'position captured before re-render');
	assert.match(boot, /pz\.setT\(keep\)/, 'position restored after theme switch (R9)');
	assert.match(boot, /window\.mermaid\.run\(\{querySelector:'\.insrc-viewer-diagram pre\.mermaid'\}\)/, 're-render uses the same source element — the definition is never rewritten (R9)');
	assert.match(boot, /localStorage\.setItem\('insrc-theme-mode',m\)/, 'persisted per-origin override');
});

test('viewer-script.test.ts: structural preservation — a rendered companion page carries the mermaid source byte-identical (NFR4)', async () => {
	const { renderCompanionPage } = await import('../../workflow/artifacts/companion/shell.js');
	const src = 'erDiagram\n  CUSTOMER ||--o{ ORDER : places\n  ORDER ||--|{ LINE-ITEM : has';
	const page = {
		title: 't', kindLabel: 'k',
		visual: { kind: 'mermaid' as const, source: src },
		description: [],
	};
	const html = renderCompanionPage(
		{ projectName: 'p', workItemId: 'w', sourceDoc: { id: 'd', href: 'd.md' }, date: '2026-10-31', user: 'u', contextLine: 'c' },
		page,
		{ panzoom: '/*PZ*/', mermaid: '/*MM*/' },
	);
	const esc = src.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
	assert.ok(html.includes(`<pre class="mermaid">${esc}</pre>`), 'the diagram source is embedded verbatim (escaped) — theming never alters content (NFR4)');
});

interface BootRun { readonly theme: string | null; readonly mode: string; readonly stored: string[] }

/** Run the generated boot script against a minimal stub DOM; `stored` is what localStorage.getItem returns. */
function runBoot(opts: { readonly stored?: string | 'throw'; readonly writeThrows?: boolean; readonly noButton?: boolean }): BootRun {
	const attrs: Record<string, string> = {};
	const writes: string[] = [];
	const root = { getAttribute: (k: string) => attrs[k] ?? null, setAttribute: (k: string, v: string) => { attrs[k] = v; } };
	const button = { setAttribute: () => undefined, addEventListener: () => undefined };
	const document = {
		querySelector: (sel: string) => (sel === '.insrc-viewer' ? root : null),
		getElementById: (id: string) => (id === 'iv-theme' && opts.noButton !== true ? button : null),
		querySelectorAll: () => [],
		addEventListener: () => undefined,
	};
	const localStorage = {
		getItem: () => { if (opts.stored === 'throw') throw new Error('denied'); return opts.stored ?? null; },
		setItem: (_k: string, v: string) => { if (opts.writeThrows === true) throw new Error('denied'); writes.push(v); },
	};
	// matchMedia throws: the script must never consult the OS colour-scheme preference
	const window: Record<string, unknown> = { matchMedia: () => { throw new Error('matchMedia must not be called'); } };
	const ctx = vm.createContext({ document, localStorage, window, setTimeout });
	vm.runInContext(viewerBootScript({ initialMode: 'light', configs: { light: {}, dark: {} } }), ctx);
	const viewer = window['insrcViewer'] as { mode(): string };
	return { theme: attrs['data-theme'] ?? null, mode: viewer.mode(), stored: writes };
}

test('viewer-script.test.ts: the boot script defaults to light and does not consult prefers-color-scheme, and a stored mode still wins', () => {
	assert.equal(runBoot({}).mode, 'light');
	assert.equal(runBoot({ stored: 'dark' }).mode, 'dark');
	assert.equal(runBoot({ stored: 'light' }).mode, 'light');
	assert.equal(runBoot({ stored: 'dark' }).theme, 'dark', 'applied to the root');
});

test('viewer-script.test.ts: run in a stub DOM, a throwing localStorage read and a throwing write fall back without error, an invalid stored value is ignored, and a missing #iv-theme is tolerated', () => {
	assert.equal(runBoot({ stored: 'throw' }).mode, 'light', 'a throwing read falls back to light');
	assert.equal(runBoot({ stored: 'dark', writeThrows: true }).mode, 'dark', 'a throwing write is swallowed');
	assert.equal(runBoot({ stored: 'sepia' }).mode, 'light', 'an invalid stored value is ignored');
	const noButton = runBoot({ noButton: true });
	assert.equal(noButton.mode, 'light');
	assert.equal(noButton.theme, 'light');
});
