/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Story E20261030486751c3:S001 — the shared theme-policy module: brand tokens,
 * both mode variants, Mermaid configs (10.9.1-supported keys only), the ER
 * override scoped to the shared .insrc-viewer-diagram class, page CSS scoped
 * under .insrc-viewer (no .insrc-artifact leakage), legend, boot script and
 * export serializer, version stamp.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
	BRAND, CONTRAST_PAIRS, DIAGRAM_OVERRIDES_CSS, LEGEND_CSS, ROLE_PALETTE, SURFACES, THEME_VERSION,
	diagramRoles, exportableSvg, fontFaceCssForArtifacts, legendHtml, legendSlotHtml, mermaidConfigFor, pageCssFor, viewerBootScript,
} from '../theme.js';

test('theme.test.ts: THEME_VERSION is stamped and brand tokens are exact', () => {
	assert.equal(THEME_VERSION, 'insors-brand-1');
	assert.equal(BRAND.crayola, '#C2E484');
	assert.equal(BRAND.phthalo, '#102D1A');
});

test('theme.test.ts: both modes produce a Mermaid config on the 10.9.1 base theme with Poppins + strict security', () => {
	for (const mode of ['light', 'dark'] as const) {
		const cfg = mermaidConfigFor(mode) as any;
		assert.equal(cfg.theme, 'base');
		assert.equal(cfg.securityLevel, 'strict', 'securityLevel never relaxed (NFR6)');
		assert.equal(cfg.startOnLoad, false);
		assert.match(cfg.themeVariables.fontFamily, /Poppins/);
		assert.equal(cfg.themeVariables.fontSize, '20px');
		assert.equal(cfg.themeVariables.darkMode, mode === 'dark');
		assert.ok(cfg.flowchart && cfg.sequence && cfg.er, 'flowchart/sequence/er settings present (R7/R8)');
	}
	assert.notDeepEqual(mermaidConfigFor('light'), mermaidConfigFor('dark'), 'modes differ');
});

test('theme.test.ts: DIAGRAM_OVERRIDES_CSS is scoped to the shared wrapper and fixes ER labels in both modes', () => {
	assert.match(DIAGRAM_OVERRIDES_CSS, /\.insrc-viewer-diagram svg \.relationshipLabel\{fill:#102D1A!important\}/);
	assert.match(DIAGRAM_OVERRIDES_CSS, /\.insrc-viewer-diagram svg \.relationshipLabelBox\{fill:#C2E484!important/);
	assert.doesNotMatch(DIAGRAM_OVERRIDES_CSS, /\.insrc-artifact/, 'never touches the chat-embed namespace');
});

test('theme.test.ts: page CSS is scoped under .insrc-viewer, has both surface variants, and never references a remote URL', () => {
	for (const mode of ['light', 'dark'] as const) {
		const css = pageCssFor(mode);
		assert.match(css, /^\.insrc-viewer\{--iv-bg:/);
		assert.ok(css.includes(SURFACES[mode].bg), `mode ${mode} canvas color present`);
		assert.doesNotMatch(css, /https?:\/\//, 'no remote URL (k5/NFR3)');
		assert.doesNotMatch(css, /\.insrc-artifact/, 'no collision with the template namespace');
		assert.match(css, /:focus-visible/, 'keyboard focus visible (NFR2)');
	}
	assert.notEqual(pageCssFor('light'), pageCssFor('dark'));
});

test('theme.test.ts: role palette + legend render only for given roles (R4)', () => {
	const html = legendHtml('dark', ['internal', 'datastore']);
	assert.match(html, /insrc-legend/);
	assert.match(html, new RegExp(ROLE_PALETTE.dark.internal.replace('#', '#')));
	assert.doesNotMatch(html, /external/, 'roles not present are not shown');
	assert.match(LEGEND_CSS, /\.insrc-legend/);
});

test('theme.test.ts: font-face CSS embeds the three packaged weights as base64 data URIs, no CDN', () => {
	const css = fontFaceCssForArtifacts();
	assert.equal((css.match(/@font-face/g) ?? []).length, 3, '400/600/700');
	assert.match(css, /font-weight:600/);
	assert.match(css, /data:font\/woff2;base64,/);
	assert.doesNotMatch(css, /https?:\/\//, 'no remote font request (NFR3)');
});

test('theme.test.ts: contrast pairs exist for both modes with NFR1 targets', () => {
	for (const mode of ['light', 'dark'] as const) {
		assert.ok(CONTRAST_PAIRS[mode].length >= 5);
		assert.ok(CONTRAST_PAIRS[mode].every(p => p.minRatio >= 3));
	}
});

test('theme.test.ts: viewerBootScript carries the readable clamp, theme persistence, safe re-render, export and error+source', () => {
	const boot = viewerBootScript({ initialMode: 'light', configs: { light: mermaidConfigFor('light'), dark: mermaidConfigFor('dark') } });
	assert.match(boot, /insrc-theme-mode/, 'persisted per-origin override (resolved question)');
	assert.match(boot, /prefers-color-scheme/, 'auto mode detection (R2)');
	assert.match(boot, /document\.fonts\.ready/, 'font readiness before measuring (R6)');
	assert.match(boot, /MIN_SCALE=0\.8/, 'readable floor: 16px labels at 20px font = 0.8 (R6/R11)');
	assert.match(boot, /Math\.max\(fit,MIN_SCALE\)/, 'initial scale clamps at the readable floor, fit is separate');
	assert.match(boot, /var keep=getTransform\(\);/, 'position captured before re-render');
	assert.match(boot, /pz\.setT\(keep\)/, 'pan/zoom transform preserved across theme re-render (R9)');
	assert.match(boot, /iv-export/, 'export control (R12)');
	assert.match(boot, /iv-err/, 'honest error state (R13)');
	assert.match(boot, /iv-src/, 'show-source toggle (R13)');
	assert.match(boot, /addEventListener\('keydown'/, 'keyboard controls (NFR2)');
	assert.match(boot, /securityLevel/, 'configs carry strict security');
});

test('theme.test.ts: exportableSvg embeds background + fonts + overrides and keeps the whole diagram', () => {
	const svg = '<svg viewBox="0 0 400 300"><g id="all-content">x</g></svg>';
	const style = fontFaceCssForArtifacts() + '\n' + DIAGRAM_OVERRIDES_CSS;
	const out = exportableSvg(svg, { bg: SURFACES.dark.bg, style });
	assert.match(out, /^<\?xml version="1\.0"/);
	assert.match(out, /xmlns="http:\/\/www\.w3\.org\/2000\/svg"/);
	assert.match(out, /<rect width="400" height="300" fill="#102D1A"\/>/, 'explicit dark background (R12)');
	assert.match(out, /@font-face/, 'Poppins embedded for offline export');
	assert.match(out, /relationshipLabel/, 'ER override embedded');
	assert.match(out, /<g id="all-content">/, 'full diagram content, not just the viewport');
	// pure: no xmlns duplication when the svg already carries one
	const withNs = exportableSvg('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"></svg>', { bg: '#fff', style: '' });
	assert.equal(withNs.match(/xmlns=/g)?.length, 1);
});

test('theme.test.ts: diagramRoles reads :::role, classDef, class and DOT class= roles only (R4)', () => {
	assert.deepEqual(diagramRoles('flowchart LR\n  A:::external --> B'), ['external']);
	assert.deepEqual(diagramRoles('classDef datastore fill:#DEF0E9\nclass n0 datastore'), ['datastore']);
	assert.deepEqual(diagramRoles('digraph { n0 [label="x", class="note"]; }'), ['note']);
	assert.deepEqual(diagramRoles('flowchart LR\n  A --> B'), [], 'no role metadata → no roles, none invented');
	assert.deepEqual(diagramRoles('flowchart LR\n  A:::bogus --> B'), [], 'unknown class names are not roles');
});

test('theme.test.ts: legendSlotHtml wraps both modes for the boot script to toggle; empty when no roles (R4)', () => {
	assert.equal(legendSlotHtml([]), '');
	const slot = legendSlotHtml(['external', 'note']);
	assert.match(slot, /data-iv-legend="light"/);
	assert.match(slot, /data-iv-legend="dark" hidden/);
	assert.match(slot, new RegExp(ROLE_PALETTE.light.external.replace('#', '#')));
	assert.match(slot, new RegExp(ROLE_PALETTE.dark.note.replace('#', '#')));
});

test('theme.test.ts: the boot script embeds the tested exportableSvg and toggles the legend with the theme (R4/R12)', () => {
	const boot = viewerBootScript({ initialMode: 'light', configs: { light: {}, dark: {} } });
	assert.match(boot, /var EXPORT_SVG=function exportableSvg\(/, 'the export serializer is embedded verbatim');
	assert.match(boot, /EXPORT_SVG\(new XMLSerializer\(\)/, 'runtime export calls it');
	assert.match(boot, /\[data-iv-legend\]/, 'theme switch shows/hides the per-mode legend');
});
