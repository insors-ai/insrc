/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * The shared Insors-branded artifact theme policy (Story E20261030486751c3:S001,
 * plans/mermaid-theme-and-readability-requirements.md R1-R15).
 *
 * ONE versioned module owns every presentation decision for generated Mermaid
 * artifacts — both rendering paths (the workflow companion shell and the
 * docgen shell, including its subprocess fallback) inline its output:
 *
 *   - BRAND: the six exact brand tokens (Insors Brand Guideline, June 2025, p5).
 *   - Derived light/dark surface tokens (implementation adaptations, not new
 *     brand colors).
 *   - mermaidConfigFor(mode): Mermaid 10.9.1 'base' theme + themeVariables —
 *     only settings the shipped runtime supports (R5).
 *   - pageCssFor(mode): the complete viewing surface (page, viewport, toolbar,
 *     legend, notes, tables, controls, focus/hover) scoped under the shared
 *     `.insrc-viewer` root (R15 — no leakage into host content).
 *   - DIAGRAM_OVERRIDES_CSS: diagram-specific fixes scoped under the shared
 *     `.insrc-viewer-diagram` wrapper, incl. the ER relationship-label
 *     dark-text-on-Crayola override that must hold in BOTH modes (R3).
 *   - LEGEND_CSS + legendHtml(): shown only when role colors carry meaning (R4).
 *   - viewerBootScript(): theme select (prefers-color-scheme + persisted
 *     per-origin override), safe re-render preserving pan/zoom, font-readiness
 *     gate, readable initial scale (labels >= 16px; fit stays a separate
 *     action), keyboard-accessible controls, SVG export, honest errors (R2,
 *     R6, R10-R13).
 *   - exportableSvg(): full-diagram SVG with embedded styling + explicit
 *     background (R12).
 *
 * The DOM contract: the artifact page root carries `.insrc-viewer` and the
 * diagram wrapper carries `.insrc-viewer-diagram` in BOTH shells (the chat
 * embed's `.insrc-artifact*` namespace is a different system and stays
 * untouched). Pan/zoom keeps its existing ids (#stage / #docgen-diagram).
 */

import { fontFaceCss, FALLBACK_FONT_STACK } from './fonts.js';

// ---------------------------------------------------------------------------
// Version + brand tokens
// ---------------------------------------------------------------------------

/** Bump when the policy changes; stamped into every generated artifact (R14). */
export const THEME_VERSION = 'insors-brand-1';

/** The six exact brand colors (Insors Brand Guideline, June 2025, page 5). */
export const BRAND = {
	phthalo:     '#102D1A', // dark canvas / strong light text / anchor surfaces
	wintergreen: '#4B9988', // secondary accents, grouping
	iguana:      '#6AB489', // supporting accents, separators, highlights
	seaGreen:    '#92CD87', // dark-mode boundaries/connectors, light surfaces
	crayola:     '#C2E484', // notes, relationship-label backgrounds, badges
	pear:        '#D1E736', // restrained emphasis, active controls, selection
} as const;

export type ThemeMode = 'light' | 'dark';

/** Derived surface tokens per mode (adaptations of the brand palette, not new
 *  official colors). */
export interface SurfaceTokens {
	readonly bg: string;
	readonly panel: string;
	readonly inset: string;
	readonly border: string;
	readonly text: string;
	readonly muted: string;
	readonly accent: string;
	/** Active/pressed control: Pear ground with dark-green text (brand rule:
	 *  Pear is the active-control accent and carries dark text — never white
	 *  on a mid green, which measures < 4.5:1). */
	readonly activeBg: string;
	readonly activeText: string;
	readonly danger: string;
}

const LIGHT: SurfaceTokens = {
	bg: '#FFFFFF',
	panel: '#F2F8EE',
	inset: '#E9F2E4',
	border: '#36745B', // derived shade of wintergreen for 3:1+ on white
	text: BRAND.phthalo,
	muted: '#3D5A4A',
	accent: BRAND.wintergreen,
	activeBg: BRAND.pear,
	activeText: BRAND.phthalo,
	danger: '#A3231B',
};

const DARK: SurfaceTokens = {
	bg: BRAND.phthalo,
	panel: '#1B3D2C', // derived lighter phthalo
	inset: '#163526', // derived darker phthalo
	border: BRAND.seaGreen,
	text: '#F5FAF2',
	muted: '#B9D6C2',
	accent: BRAND.seaGreen,
	activeBg: BRAND.pear,
	activeText: BRAND.phthalo,
	danger: '#FF9C8F',
};

export const SURFACES: Record<ThemeMode, SurfaceTokens> = { light: LIGHT, dark: DARK };

// ---------------------------------------------------------------------------
// Contrast pairs (NFR1: text >= 4.5:1, connectors/boundaries >= 3:1) — the
// contrast.test.ts recomputes these from BRAND/SURFACES and fails on drift.
// ---------------------------------------------------------------------------

/** The load-bearing foreground/background pairs, per mode. */
export const CONTRAST_PAIRS: Record<ThemeMode, { fg: string; bg: string; role: string; minRatio: number }[]> = {
	light: [
		{ fg: LIGHT.text, bg: LIGHT.bg, role: 'body text on canvas', minRatio: 4.5 },
		{ fg: LIGHT.text, bg: LIGHT.panel, role: 'node text on panel surface', minRatio: 4.5 },
		{ fg: LIGHT.text, bg: BRAND.crayola, role: 'dark-green text on Crayola label/note boxes', minRatio: 4.5 },
		{ fg: LIGHT.muted, bg: LIGHT.bg, role: 'secondary text on canvas', minRatio: 4.5 },
		{ fg: LIGHT.border, bg: LIGHT.bg, role: 'borders/connectors on canvas', minRatio: 3 },
		{ fg: LIGHT.activeText, bg: LIGHT.activeBg, role: 'active control label (Pear + dark green)', minRatio: 4.5 },
		{ fg: LIGHT.accent, bg: LIGHT.bg, role: 'accent used as border/hover on canvas', minRatio: 3 },
	],
	dark: [
		{ fg: DARK.text, bg: DARK.bg, role: 'body text on dark canvas', minRatio: 4.5 },
		{ fg: DARK.text, bg: DARK.panel, role: 'node text on panel surface', minRatio: 4.5 },
		{ fg: BRAND.phthalo, bg: BRAND.crayola, role: 'ER relationship labels: dark text on Crayola in DARK mode', minRatio: 4.5 },
		{ fg: DARK.muted, bg: DARK.bg, role: 'secondary text on dark canvas', minRatio: 4.5 },
		{ fg: DARK.border, bg: DARK.bg, role: 'borders/connectors on dark canvas', minRatio: 3 },
		{ fg: DARK.activeText, bg: DARK.activeBg, role: 'active control label (Pear + dark green)', minRatio: 4.5 },
	],
};

// ---------------------------------------------------------------------------
// Semantic role palette (R4) — applied ONLY when the structured source carries
// role metadata; never invented for decoration.
// ---------------------------------------------------------------------------

export type DiagramRole = 'internal' | 'datastore' | 'external' | 'note';

export const ROLE_PALETTE: Record<ThemeMode, Record<DiagramRole, string>> = {
	light: { internal: '#E7F3E4', datastore: '#DEF0E9', external: '#FDF3D0', note: BRAND.crayola },
	dark:  { internal: '#214D35', datastore: '#28584D', external: '#4A4423', note: BRAND.crayola },
};

/** Legend markup shown when role colors carry meaning (R4). */
export function legendHtml(mode: ThemeMode, roles: readonly DiagramRole[]): string {
	const items = roles
		.map(r => `<span class="lg-item"><i style="background:${ROLE_PALETTE[mode][r]}"></i>${r}</span>`)
		.join('');
	return `<div class="insrc-legend" role="list">${items}</div>`;
}

const ROLE_NAMES: readonly DiagramRole[] = ['internal', 'datastore', 'external', 'note'];

/** Narrow a structured-source label (e.g. an IR node `kind`) to a role, when it IS one. */
export function asDiagramRole(name: string): DiagramRole | undefined {
	return (ROLE_NAMES as readonly string[]).includes(name) ? name as DiagramRole : undefined;
}

/**
 * The roles a diagram source actually carries (R4): `:::role` class
 * assignments, `classDef <role>` declarations and `class <ids> <role>`
 * statements whose name is a known role. Diagrams without role metadata get
 * no legend — roles are never invented from names.
 */
export function diagramRoles(source: string): DiagramRole[] {
	const found = new Set<DiagramRole>();
	const isRole = (name: string | undefined): name is DiagramRole =>
		name !== undefined && asDiagramRole(name) !== undefined;
	for (const m of source.matchAll(/:::\s*([A-Za-z_][\w-]*)/g)) if (isRole(m[1])) found.add(m[1]);
	for (const m of source.matchAll(/^\s*classDef\s+([A-Za-z_][\w-]*)/gm)) if (isRole(m[1])) found.add(m[1]);
	// DOT attributes (`class="external"` / `class=external`) used by the fallback renderer
	for (const m of source.matchAll(/\bclass\s*=\s*"?([A-Za-z_][\w-]*)"?/g)) if (isRole(m[1])) found.add(m[1]);
	for (const m of source.matchAll(/^\s*class\s+[^;]+$/gm)) {
		for (const token of (m[0].match(/[A-Za-z_][\w-]*/g) ?? [])) if (isRole(token)) found.add(token);
	}
	return ROLE_NAMES.filter(r => found.has(r));
}

/**
 * Both-mode legend slot the shells inject under the viewport when the diagram
 * carries roles (R4). Each mode's legend sits in a `[data-iv-legend]` wrapper
 * the boot script shows/hides with the active theme — same pattern as the
 * `style[data-iv-mode]` tags.
 */
export function legendSlotHtml(roles: readonly DiagramRole[]): string {
	if (roles.length === 0) return '';
	return `<div data-iv-legend="light">${legendHtml('light', roles)}</div>` +
		`<div data-iv-legend="dark" hidden>${legendHtml('dark', roles)}</div>`;
}

// ---------------------------------------------------------------------------
// Mermaid configuration per mode (R5: only 10.9.1-supported settings)
// ---------------------------------------------------------------------------

export function mermaidConfigFor(mode: ThemeMode): Record<string, unknown> {
	const s = SURFACES[mode];
	const darkMode = mode === 'dark';
	return {
		startOnLoad: false,
		securityLevel: 'strict', // NFR6: never relaxed
		theme: 'base',
		themeVariables: {
			darkMode,
			background: s.bg,
			fontFamily: FALLBACK_FONT_STACK,
			fontSize: '20px', // readable base; the viewer clamps the initial scale so labels stay >= 16px (R6)
			primaryColor: ROLE_PALETTE[mode].internal,
			primaryTextColor: s.text,
			primaryBorderColor: s.border,
			secondaryColor: ROLE_PALETTE[mode].datastore,
			secondaryTextColor: s.text,
			secondaryBorderColor: s.border,
			tertiaryColor: BRAND.crayola,
			tertiaryTextColor: BRAND.phthalo,
			lineColor: s.border,
			textColor: s.text,
			mainBkg: ROLE_PALETTE[mode].internal,
			nodeBorder: s.border,
			clusterBkg: ROLE_PALETTE[mode].datastore,
			clusterBorder: s.border,
			titleColor: s.text,
			edgeLabelBackground: s.bg,
			actorBkg: ROLE_PALETTE[mode].internal,
			actorBorder: s.border,
			actorTextColor: s.text,
			actorLineColor: s.border,
			signalColor: s.border,
			signalTextColor: s.text,
			labelBoxBkgColor: ROLE_PALETTE[mode].internal,
			labelBoxBorderColor: s.border,
			labelTextColor: s.text,
			loopTextColor: s.text,
			noteBkgColor: BRAND.crayola,
			noteBorderColor: BRAND.iguana,
			noteTextColor: BRAND.phthalo,
			activationBkgColor: ROLE_PALETTE[mode].datastore,
			activationBorderColor: s.border,
			attributeBackgroundColorOdd: s.bg,
			attributeBackgroundColorEven: s.panel,
		},
		flowchart: { nodeSpacing: 50, rankSpacing: 70, curve: 'basis', padding: 12 },
		sequence: { actorMargin: 70, messageMargin: 46, noteMargin: 20, actorFontSize: '20px', messageFontSize: '20px', noteFontSize: '18px' },
		er: { fontSize: 20, entityPadding: 22, attributeFontSize: '18px' },
		class: { fontSize: '20px' },
	};
}

// ---------------------------------------------------------------------------
// Diagram-specific overrides (R3) — scoped to the shared diagram wrapper class
// so they apply identically in BOTH shells' DOM (review round-2 fix).
// ---------------------------------------------------------------------------

export const DIAGRAM_OVERRIDES_CSS = [
	// ER relationship labels: dark-green text on Crayola boxes in BOTH modes —
	// pale green boxes must not inherit white dark-mode text (R3/R12).
	'.insrc-viewer-diagram svg .relationshipLabel{fill:#102D1A!important}',
	'.insrc-viewer-diagram svg .relationshipLabelBox{fill:#C2E484!important;opacity:1!important;stroke:#6AB489!important}',
	'.insrc-viewer-diagram svg .relationshipLine{stroke:#36745B!important;stroke-width:1.6px!important}',
	// sequence notes and ER attribute rows keep their surfaces readable
	'.insrc-viewer-diagram svg .noteText{fill:#102D1A!important}',
	'.insrc-viewer-diagram svg .er.attributeBoxEven{fill:#E9F2E4!important}',
	'.insrc-viewer-diagram svg .er.attributeBoxOdd{fill:#FFFFFF!important}',
	'.insrc-viewer-diagram svg .er.attributeLabelBox,.insrc-viewer-diagram svg .er.attributeText{fill:#102D1A!important}',
].join('\n');

// ---------------------------------------------------------------------------
// Page surface CSS per mode (R2/R15) — everything scoped under .insrc-viewer
// ---------------------------------------------------------------------------

export function pageCssFor(mode: ThemeMode): string {
	const s = SURFACES[mode];
	return [
		`.insrc-viewer{--iv-bg:${s.bg};--iv-panel:${s.panel};--iv-inset:${s.inset};--iv-border:${s.border};--iv-text:${s.text};--iv-muted:${s.muted};--iv-accent:${s.accent};--iv-active-bg:${s.activeBg};--iv-active-text:${s.activeText};--iv-danger:${s.danger};`,
		`margin:0;background:var(--iv-bg);color:var(--iv-text);font:14px/1.55 ${FALLBACK_FONT_STACK};}`,
		`.insrc-viewer *{box-sizing:border-box}`,
		`.insrc-viewer h1,.insrc-viewer h2,.insrc-viewer h3,.insrc-viewer .insrc-viewer-title{font-family:${FALLBACK_FONT_STACK};font-weight:600;color:var(--iv-text)}`,
		`.insrc-viewer .iv-bar{display:flex;align-items:center;gap:6px;flex-wrap:wrap;padding:6px 10px;background:var(--iv-inset);border-bottom:1px solid var(--iv-border);color:var(--iv-muted);font-size:12px}`,
		`.insrc-viewer .iv-bar .sp{flex:1}`,
		`.insrc-viewer .iv-bar button{font:inherit;font-size:12px;border:1px solid var(--iv-border);background:var(--iv-panel);color:var(--iv-text);border-radius:4px;padding:3px 9px;cursor:pointer}`,
		`.insrc-viewer .iv-bar button:hover{background:var(--iv-inset)}`,
		`.insrc-viewer .iv-bar button:focus-visible{outline:2px solid var(--iv-accent);outline-offset:1px}`,
		`.insrc-viewer .iv-bar button[aria-pressed="true"]{background:var(--iv-active-bg);color:var(--iv-active-text);border-color:var(--iv-active-bg);font-weight:600}`,
		`.insrc-viewer .iv-vp{position:relative;height:62vh;min-height:380px;overflow:hidden;cursor:grab;background:var(--iv-bg)}`,
		`.insrc-viewer .iv-vp.drag{cursor:grabbing}`,
		`.insrc-viewer .iv-stage{position:absolute;left:0;top:0;transform-origin:0 0;will-change:transform}`,
		`.insrc-viewer .iv-stage pre.mermaid{margin:0;background:transparent}`,
		`.insrc-viewer .insrc-viewer-diagram{background:var(--iv-bg)}`,
		`.insrc-viewer .insrc-legend{display:flex;gap:14px;flex-wrap:wrap;padding:6px 10px;border-top:1px solid var(--iv-border);background:var(--iv-inset);font-size:12px;color:var(--iv-text)}`,
		`.insrc-viewer .insrc-legend .lg-item{display:inline-flex;align-items:center;gap:5px}`,
		`.insrc-viewer .insrc-legend .lg-item i{width:11px;height:11px;border-radius:3px;border:1px solid var(--iv-border);display:inline-block}`,
		`.insrc-viewer table.iv-dt{border-collapse:collapse;width:100%;font-size:13px;background:var(--iv-bg);margin-bottom:6px}`,
		`.insrc-viewer table.iv-dt th{text-align:left;background:var(--iv-inset);color:var(--iv-text);font-weight:600;padding:7px 10px;border:1px solid var(--iv-border)}`,
		`.insrc-viewer table.iv-dt td{padding:7px 10px;border:1px solid var(--iv-border);vertical-align:top;color:var(--iv-text)}`,
		`.insrc-viewer .iv-err{color:var(--iv-danger);padding:8px;font-family:ui-monospace,Menlo,monospace;white-space:pre-wrap}`,
		`.insrc-viewer .iv-src{display:none;padding:8px;background:var(--iv-inset);border-top:1px solid var(--iv-border);font:12px/1.5 ui-monospace,Menlo,monospace;white-space:pre-wrap;color:var(--iv-text)}`,
		`.insrc-viewer .iv-src.open{display:block}`,
		`.insrc-viewer a{color:var(--iv-accent)}`,
		`@media (max-width:640px){.insrc-viewer .iv-vp{height:52vh;min-height:300px}.insrc-viewer .iv-bar{gap:4px}}`,
	].join('\n');
}

/** The legend CSS (shared, mode-agnostic — swatches carry their own colors). */
export const LEGEND_CSS = [
	'.insrc-viewer .insrc-legend{display:flex;gap:14px;flex-wrap:wrap;padding:6px 10px;border-top:1px solid var(--iv-border);background:var(--iv-inset);font-size:12px;color:var(--iv-text)}',
	'.insrc-viewer .insrc-legend .lg-item{display:inline-flex;align-items:center;gap:5px}',
	'.insrc-viewer .insrc-legend .lg-item i{width:11px;height:11px;border-radius:3px;border:1px solid var(--iv-border);display:inline-block}',
].join('\n');

/** The font-face CSS (packaged Poppins, base64) — inlined into every artifact. */
export function fontFaceCssForArtifacts(): string {
	return fontFaceCss();
}

// ---------------------------------------------------------------------------
// Viewer boot script (R2, R6, R10-R13) — inlined into the artifact page.
// ---------------------------------------------------------------------------

export interface ViewerBootOpts {
	/** CSS for the initial mode; the script re-renders on toggle. */
	readonly initialMode: ThemeMode;
	/** mermaid config JSON for each mode (embedded by the shell). */
	readonly configs: Record<ThemeMode, unknown>;
	/** Readable floor: labels target >= 16 CSS px; mermaid fontSize is 20px, so
	 *  the minimum relative scale is 16/20 = 0.8 of the natural size. */
	readonly minLabelPx?: number;
}

/**
 * The boot script body (a string the shells inline in a <script>). It:
 *  - picks the mode from localStorage('insrc-theme-mode') else
 *    prefers-color-scheme, and applies data-theme on the root;
 *  - waits for document.fonts.ready (timeout-guarded) BEFORE mermaid.run so
 *    labels are measured with Poppins, not the fallback (R6/NFR3);
 *  - renders at a readable initial scale: scale = clamp(fit, minScale, 1) where
 *    minScale = minLabelPx / fontSizePx (labels >= 16px); Fit is a SEPARATE
 *    toolbar action (R6/R11);
 *  - on theme toggle: re-initializes mermaid with the other mode's config,
 *    re-runs the SAME source, and restores the pan/zoom transform (R9);
 *  - exposes keyboard-accessible zoom in/out, fit, 1:1, theme, export controls
 *    (R10/NFR2);
 *  - export serializes the FULL svg with the embedded font style + an explicit
 *    background rect in the mode's canvas color (R12);
 *  - render errors show an actionable message + a show-source toggle (R13).
 */
export function viewerBootScript(opts: ViewerBootOpts): string {
	const configsJson = JSON.stringify(opts.configs);
	const minScale = (opts.minLabelPx ?? 16) / 20;
	return `
(function(){
  var root=document.querySelector('.insrc-viewer');
  var stage=document.querySelector('.insrc-viewer-diagram');
  var vp=document.getElementById('iv-vp')||document.querySelector('.iv-vp');
  var CONFIGS=${configsJson};
  var MIN_SCALE=${minScale};
  // pz adapter: the shells install window.insrcPz = {fit,reset,zoomTo,getT,setT}
  // (companion: panzoom.js; docgen: svg-pan-zoom). When absent the script
  // installs its own minimal pan/zoom.
  var pz=window.insrcPz||null;
  var mode=(function(){try{var m=localStorage.getItem('insrc-theme-mode');if(m==='light'||m==='dark')return m;}catch(e){}return (window.matchMedia&&window.matchMedia('(prefers-color-scheme: dark)').matches)?'dark':'${opts.initialMode}';})();
  var SURFACES_BG=${JSON.stringify({ light: LIGHT.bg, dark: DARK.bg })};
  var CSS_TEXT=root.getAttribute('data-iv-export-css')||'';
  // The tested export serializer, embedded verbatim so the in-browser export
  // runs the same code the unit tests exercise (R12).
  var EXPORT_SVG=${exportableSvg.toString()};
  function applyMode(m,rerender){
    mode=m;if(root)root.setAttribute('data-theme',m);
    document.querySelectorAll('style[data-iv-mode]').forEach(function(s){s.disabled=(s.getAttribute('data-iv-mode')!==m);});
    document.querySelectorAll('[data-iv-legend]').forEach(function(el){el.hidden=(el.getAttribute('data-iv-legend')!==m);});
    try{localStorage.setItem('insrc-theme-mode',m);}catch(e){}
    var t=document.getElementById('iv-theme');if(t)t.setAttribute('aria-pressed',m==='dark'?'true':'false');
    if(rerender)doRender();
  }
  function src(){var p=stage&&stage.querySelector('pre.mermaid');return p?p.textContent:'';}
  function setTransform(t){
    if(pz&&pz.setT){pz.setT(t);return;}
    if(!stage)return;
    stage.style.transform='translate('+t.x+'px,'+t.y+'px) scale('+t.s+')';
    var z=document.getElementById('iv-zl');if(z)z.textContent=Math.round(t.s*100)+'%';
  }
  function getTransform(){
    if(pz&&pz.getT)return pz.getT();
    if(!stage)return null;
    var m=/translate\(([-\d.]+)px,([-\d.]+)px\) scale\(([\d.]+)\)/.exec(stage.style.transform||'');
    return m?{x:parseFloat(m[1]),y:parseFloat(m[2]),s:parseFloat(m[3])}:null;
  }
  function frame(initial){
    var svg=stage&&stage.querySelector('svg');if(!svg||!vp)return;
    var vb=svg.viewBox&&svg.viewBox.baseVal;if(!vb||!vb.width)return;
    var fit=Math.min(vp.clientWidth/vb.width,vp.clientHeight/vb.height);
    var scale=Math.min(1,Math.max(fit,MIN_SCALE)); // readable floor; cap at natural; Fit is a separate action
    if(!initial){var t=getTransform();if(t){setTransform(t);return;}}
    var tx=(vp.clientWidth-vb.width*scale)/2, ty=(vp.clientHeight-vb.height*scale)/2;
    setTransform({x:tx,y:ty,s:scale});
  }
  function doRender(){
    var pre=stage&&stage.querySelector('pre.mermaid');
    if(!pre||!window.mermaid)return;
    var keep=getTransform();
    window.mermaid.initialize(CONFIGS[mode]);
    Promise.resolve(window.mermaid.run({querySelector:'.insrc-viewer-diagram pre.mermaid'})).then(function(){
      var svg=stage.querySelector('svg');
      if(svg){var vb=svg.viewBox&&svg.viewBox.baseVal;if(vb&&vb.width){svg.setAttribute('width',vb.width);svg.setAttribute('height',vb.height);svg.style.maxWidth='none';}}
      frame(false);
      if(keep&&pz&&pz.setT)pz.setT(keep); // theme switch: restore the reader's position (R9)
      if(window.insrcMarkCodeRefs)window.insrcMarkCodeRefs();
    }).catch(function(err){
      var e=document.getElementById('iv-err');if(e)e.textContent='Diagram could not be drawn: '+err;
      var s=document.getElementById('iv-src');if(s)s.textContent=src();
    });
  }
  function zoomBy(f){var t=getTransform();if(!t)return;setTransform({x:t.x,y:t.y,s:Math.min(20,Math.max(MIN_SCALE,t.s*f))});}
  function fitView(){if(pz&&pz.fit){pz.fit();return;}frame(false);}
  function resetView(){if(pz&&pz.reset){pz.reset();return;}var t=getTransform();if(t)setTransform({x:20,y:20,s:1});}
  function exportSvg(){
    var svg=stage&&stage.querySelector('svg');if(!svg)return null;
    var clone=svg.cloneNode(true);
    clone.setAttribute('xmlns','http://www.w3.org/2000/svg');
    return EXPORT_SVG(new XMLSerializer().serializeToString(clone),{bg:SURFACES_BG[mode],style:CSS_TEXT});
  }
  window.insrcViewer={setMode:function(m){applyMode(m,true);},fit:fitView,zoomIn:function(){zoomBy(1.25);},zoomOut:function(){zoomBy(0.8);},reset:resetView,exportSvg:exportSvg,mode:function(){return mode;}};
  function on(id,fn){var b=document.getElementById(id);if(b)b.addEventListener('click',fn);}
  on('iv-theme',function(){applyMode(mode==='dark'?'light':'dark',true);});
  on('iv-export',function(){var s=exportSvg();if(!s)return;var a=document.createElement('a');a.href='data:image/svg+xml;charset=utf-8,'+encodeURIComponent(s);a.download='diagram.svg';a.click();});
  on('iv-srcbtn',function(){var s=document.getElementById('iv-src');if(s)s.classList.toggle('open');});
  // When no external pz adapter: install the minimal internal pan/zoom.
  if(!pz&&vp){
    on('iv-zin',function(){zoomBy(1.25);});on('iv-zout',function(){zoomBy(0.8);});
    on('iv-zfit',fitView);on('iv-z100',resetView);
    document.addEventListener('keydown',function(e){
      if(e.key==='+'||e.key==='=')zoomBy(1.25);else if(e.key==='-')zoomBy(0.8);
      else if(e.key==='0')resetView();else if(e.key==='f')fitView();
    });
    var drag=null;
    vp.addEventListener('mousedown',function(e){var t=getTransform();drag={x:e.clientX,y:e.clientY,t:t};vp.classList.add('drag');});
    window.addEventListener('mousemove',function(e){if(!drag)return;var t=drag.t;setTransform({x:t.x+e.clientX-drag.x,y:t.y+e.clientY-drag.y,s:t.s});});
    window.addEventListener('mouseup',function(){drag=null;vp.classList.remove('drag');});
    vp.addEventListener('wheel',function(e){e.preventDefault();zoomBy(e.deltaY<0?1.15:0.87);},{passive:false});
    window.addEventListener('resize',function(){frame(false);});
  }
  applyMode(mode,false);
  var ready=(document.fonts&&document.fonts.ready)?Promise.race([document.fonts.ready,new Promise(function(r){setTimeout(r,1500);})]):Promise.resolve();
  ready.then(doRender);
})();
`;
}

// ---------------------------------------------------------------------------
// SVG export serializer (R12)
// ---------------------------------------------------------------------------

/**
 * Serialize a rendered diagram SVG for standalone export: full diagram (not the
 * viewport), explicit background rect in the mode's canvas color, and an
 * embedded <style> with the font-face + diagram overrides so the export keeps
 * Poppins and the ER label treatment outside the viewer.
 *
 * Deliberately PURE — every input arrives via `opts` — so the shells can embed
 * this exact function (`exportableSvg.toString()`) into the runtime boot
 * script and the in-browser export runs the same tested code (R12).
 */
export function exportableSvg(svgText: string, opts: { readonly bg: string; readonly style: string }): string {
	const { bg, style } = opts;
	// insert background rect + style right after the opening <svg ...> tag
	const openEnd = svgText.indexOf('>');
	if (openEnd === -1) return svgText;
	let open = svgText.slice(0, openEnd + 1);
	const rest = svgText.slice(openEnd + 1);
	if (!open.includes('xmlns=')) open = open.replace('<svg ', '<svg xmlns="http://www.w3.org/2000/svg" ');
	const vb = /viewBox="([^"]+)"/.exec(open)?.[1]?.split(/\s+/).map(Number);
	const w = vb && Number.isFinite(vb[2]) ? vb[2] : 800;
	const h = vb && Number.isFinite(vb[3]) ? vb[3] : 600;
	return `<?xml version="1.0" encoding="UTF-8"?>\n` +
		open +
		`<rect width="${w}" height="${h}" fill="${bg}"/><style>${style.replace(/<\//g, '<\\/')}</style>` +
		rest;
}
