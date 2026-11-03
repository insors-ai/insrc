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
