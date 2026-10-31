/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * docgen — oversized-scope subprocess fallback (Epic 870ed3dd, Story s5).
 *
 * The primary Mermaid inline path (render/shell.ts) lays out small diagrams
 * legibly, but a whole-repo component-dependency graph can exceed what a
 * client-side Mermaid layout can render usefully. This module is the fallback
 * that path dispatches to for oversized scopes (k9): a fixed size predicate
 * (`oversized`), a graph-derived IR→DOT emitter (`toGraphvizDot`), an injected
 * subprocess renderer seam (`SubprocessRenderer` / `graphvizSubprocessRenderer`
 * probing Graphviz `dot` then `d2`), and the assembler that inlines the
 * subprocess SVG + svg-pan-zoom into the SAME sc3 offline shell as the primary
 * path (`assembleFallbackShell`).
 *
 * Invariants (LLD s5): the subprocess is reserved for oversized scopes only —
 * a doc that fit the primary path never spawns (ac4/k9); the DOT is emitted
 * from `ir.derived` alone, never narrated content (k8/k11); the child is spawned
 * with `shell:false` + fixed literal args and the DOT crosses only via stdin, so
 * no graph-derived string is shell-interpolated (k10); a missing binary is
 * RETURNED as `unavailable`, never thrown. This module must NOT import from
 * render/shell.ts — shell.ts imports from here (the dispatch direction).
 */

import { spawn } from 'node:child_process';

import type { DocumentIR, RenderedDocumentShell } from '../types.js';
import { renderNarrativeBand } from './narrative.js';
import {
	DIAGRAM_OVERRIDES_CSS, SURFACES, THEME_VERSION, diagramRoles, exportableSvg, fontFaceCssForArtifacts, legendSlotHtml, pageStyleTags,
} from '../../artifact-theme/theme.js';
import { CODE_REF_SCRIPT } from './code-ref-script.js';

// ── t1 · oversized predicate ───────────────────────────────────────────────

/** The fixed legibility bound: a combined `ir.derived` node+edge count above
 *  which the primary Mermaid path is deemed unable to lay out legibly and the
 *  subprocess fallback is used. One empirically-calibrated global limit
 *  (HLD boundary: "combined node+edge count against one fixed limit"). */
export const OVERSIZED_LIMIT = 60;

/**
 * True when the derived diagram is too large for the primary Mermaid path
 * (`nodes.length + edges.length > limit`). Strict `>`, so a scope exactly AT
 * the limit keeps the primary path (ac4). Pure + deterministic; reads only
 * `ir.derived` counts, no I/O. `limit` is injectable for tests/tuning.
 */
export function oversized(ir: DocumentIR, limit: number = OVERSIZED_LIMIT): boolean {
	return ir.derived.nodes.length + ir.derived.edges.length > limit;
}

// ── t2 · IR → Graphviz DOT ─────────────────────────────────────────────────

/** Escape a label for a DOT double-quoted string: backslash first (so it does
 *  not double-escape the quote/newline replacements), then the quote, then
 *  collapse newlines to the DOT `\n` escape. */
function escapeDotLabel(label: string): string {
	return label.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\r?\n/g, '\\n');
}

/**
 * Emit a Graphviz DOT digraph over the DERIVED nodes/edges: one node per IrNode
 * (label = its label), one `from -> to` edge per IrEdge. Node identifiers use
 * the same short `n0,n1,…` aliases as documentIRToMermaid so graph-derived
 * entity ids never clash with DOT syntax; the real name rides in the escaped
 * label. An edge to an alias-less node is skipped (mirrors the Mermaid path).
 * Pure + deterministic; only graph-derived content (k8/k11).
 */
export function toGraphvizDot(ir: DocumentIR): string {
	const alias = new Map<string, string>();
	ir.derived.nodes.forEach((n, i) => alias.set(n.id, `n${i}`));
	const lines: string[] = ['digraph docgen {'];
	for (const n of ir.derived.nodes) {
		lines.push(`  ${alias.get(n.id)!} [label="${escapeDotLabel(n.label)}"];`);
	}
	for (const e of ir.derived.edges) {
		const from = alias.get(e.from);
		const to = alias.get(e.to);
		if (from !== undefined && to !== undefined) lines.push(`  ${from} -> ${to};`);
	}
	lines.push('}');
	return lines.join('\n');
}

// ── t3 · subprocess renderer seam ──────────────────────────────────────────

/** The subprocess seam's outcome (s5-internal, not a shared contract). `ok`
 *  carries the SVG + which tool produced it; `unavailable` carries a reason and
 *  the binaries that were tried. assembleShell maps `unavailable` to the sc4
 *  fallback-unavailable variant. */
export type SubprocessRenderResult =
	| { readonly status: 'ok'; readonly svg: string; readonly tool: 'dot' | 'd2' }
	| { readonly status: 'unavailable'; readonly reason: string; readonly triedBinaries: readonly string[] };

/** The injected subprocess seam: feed DOT to an external renderer and get its
 *  SVG, or a signal that no renderer binary is available. A fake in tests, the
 *  real spawn in production. Never throws for the modelled cases. */
export interface SubprocessRenderer {
	renderSvg(dot: string): Promise<SubprocessRenderResult>;
}

/** Bound: wall-clock cap on one subprocess attempt before it is SIGKILLed. */
const RENDER_TIMEOUT_MS = 15_000;

/** One renderer candidate: the binary + its fixed argv (reads DOT on stdin,
 *  writes SVG on stdout). */
interface Candidate {
	readonly tool: 'dot' | 'd2';
	readonly cmd:  string;
	readonly args: readonly string[];
}

// Probe order (LLD alt a1): Graphviz `dot` first, then `d2`. `dot -Tsvg` reads
// DOT on stdin; `d2 - -` reads from stdin (`-`) and writes to stdout (`-`).
const CANDIDATES: readonly Candidate[] = [
	{ tool: 'dot', cmd: 'dot', args: ['-Tsvg'] },
	{ tool: 'd2',  cmd: 'd2',  args: ['-', '-'] },
];

/** The per-candidate spawn result: absent binary (ENOENT → try next), a real
 *  failure (surface it), or a rendered SVG. */
type AttemptResult =
	| { readonly kind: 'enoent' }
	| { readonly kind: 'failed'; readonly reason: string }
	| { readonly kind: 'ok'; readonly svg: string };

/** Spawn one candidate, feed it the DOT via stdin, and resolve its outcome.
 *  `shell:false` + fixed literal args + DOT-only-on-stdin — no shell
 *  interpolation (k10). Bounded by a timeout with SIGKILL; never rejects. */
function runCandidate(cand: Candidate, dot: string): Promise<AttemptResult> {
	return new Promise<AttemptResult>(resolve => {
		let stdout = '';
		let stderr = '';
		let settled = false;
		let timedOut = false;
		const done = (r: AttemptResult): void => {
			if (settled) return;
			settled = true;
			clearTimeout(timer);
			resolve(r);
		};

		const child = spawn(cand.cmd, [...cand.args], { stdio: ['pipe', 'pipe', 'pipe'], shell: false });
		const timer = setTimeout(() => { timedOut = true; child.kill('SIGKILL'); }, RENDER_TIMEOUT_MS);

		child.on('error', (err: NodeJS.ErrnoException) => {
			if (err.code === 'ENOENT') done({ kind: 'enoent' });
			else done({ kind: 'failed', reason: `${cand.cmd} spawn error: ${err.message}` });
		});
		child.stdout?.on('data', (c: Buffer) => { stdout += c.toString('utf8'); });
		child.stderr?.on('data', (c: Buffer) => { stderr += c.toString('utf8'); });
		child.on('close', (code: number | null) => {
			if (timedOut) { done({ kind: 'failed', reason: `${cand.cmd} timed out after ${RENDER_TIMEOUT_MS}ms` }); return; }
			if (code === 0 && stdout.includes('<svg')) { done({ kind: 'ok', svg: stdout }); return; }
			const trimmed = stderr.trim();
			done({ kind: 'failed', reason: `${cand.cmd} exited ${code ?? 'null'}${trimmed ? `: ${trimmed}` : ''}` });
		});

		// Feed the DOT source. An absent binary makes the stdin stream emit EPIPE
		// before/while writing — swallow it; the 'error' event above is the signal.
		child.stdin?.on('error', () => { /* ignore — reported via child 'error' */ });
		child.stdin?.end(dot);
	});
}

/**
 * The production subprocess seam: probe `dot` then `d2`. An ENOENT (binary
 * absent) skips to the next candidate; the first that renders an SVG wins.
 * When BOTH are absent → `unavailable` naming the tried binaries (ac3). A
 * present binary that fails (nonzero exit / no SVG / timeout) is surfaced
 * immediately as `unavailable` with the captured reason rather than masked by
 * the next candidate.
 */
export const graphvizSubprocessRenderer: SubprocessRenderer = {
	async renderSvg(dot: string): Promise<SubprocessRenderResult> {
		const tried: string[] = [];
		for (const cand of CANDIDATES) {
			const attempt = await runCandidate(cand, dot);
			if (attempt.kind === 'ok') return { status: 'ok', svg: attempt.svg, tool: cand.tool };
			tried.push(cand.tool);
			if (attempt.kind === 'enoent') continue;               // binary absent → try next
			return { status: 'unavailable', reason: attempt.reason, triedBinaries: tried }; // real failure
		}
		return { status: 'unavailable', reason: 'no subprocess renderer binary available', triedBinaries: tried };
	},
};

// ── t4 · fallback shell assembly ───────────────────────────────────────────

function escapeHtml(s: string): string {
	return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/**
 * Assemble the sc3 fallback shell: the subprocess-produced `<svg>` inlined
 * DIRECTLY (already vector markup) + the vendored svg-pan-zoom bundle + an init
 * calling window.svgPanZoom on it (NO mermaid). Byte-for-byte a single
 * self-contained offline file — no external URL — in the SAME
 * RenderedDocumentShell shape as the primary path, distinguished only by
 * `backend: 'fallback-subprocess'` (ac2). Pure: no I/O.
 *
 * S001: at parity with the primary shell, the SAME narrated band (context
 * sections + the optional escaped source-link) is appended below the diagram
 * via the shared renderNarrativeBand. An empty band (no sections AND no
 * sourceLink) is '' → byte-identical to the pre-S001 fallback output.
 */
export function assembleFallbackShell(
	ir: DocumentIR,
	svg: string,
	svgPanZoom: string,
	svgPanZoomVersion: string,
): RenderedDocumentShell {
	const narrative = renderNarrativeBand(ir.narrated.sections, ir.narrated.sourceLink);
	// R4: the legend renders only when the diagram source carries role classes.
	const legend = legendSlotHtml(diagramRoles(toGraphvizDot(ir)));
	// A narrative band shares the viewport with the diagram; a band-less doc keeps
	// the full-height diagram (no inline style → byte-identical to before).
	const diagramStyle = narrative !== '' ? ' style="height:65vh"' : '';
	const init = `
(function () {
  var SURFACES_BG=${JSON.stringify({ light: SURFACES.light.bg, dark: SURFACES.dark.bg })};
  var EXPORT_SVG=${exportableSvg.toString()};
  var panzoomInstance = null;
  var svg = document.querySelector('#docgen-diagram svg');
  if (svg && window.svgPanZoom) {
    svg.setAttribute('width', '100%'); svg.setAttribute('height', '100%');
    svg.style.maxWidth = 'none';
    panzoomInstance = window.svgPanZoom(svg, { controlIconsEnabled: true, fit: true, center: true, minZoom: 0.2, maxZoom: 20 });
  }
  window.insrcPz = panzoomInstance ? {
    fit: function () { panzoomInstance.fit(); },
    reset: function () { panzoomInstance.reset(); },
    zoomTo: function (s) { panzoomInstance.zoomTo(s); },
    getT: function () { return { s: panzoomInstance.getZoom(), x: 0, y: 0 }; },
    setT: function (t) { if (t && typeof t.s === 'number') panzoomInstance.zoomTo(t.s); },
  } : null;
  // theme toggle for the fallback shell (page-level; the SVG is pre-rendered)
  var mode = (function(){try{var m=localStorage.getItem('insrc-theme-mode');if(m==='light'||m==='dark')return m;}catch(e){}return (window.matchMedia&&window.matchMedia('(prefers-color-scheme: dark)').matches)?'dark':'light';})();
  function applyMode(m){
    mode=m;document.body.setAttribute('data-theme',m);
    document.querySelectorAll('style[data-iv-mode]').forEach(function(s){s.disabled=(s.getAttribute('data-iv-mode')!==m);});
    document.querySelectorAll('[data-iv-legend]').forEach(function(el){el.hidden=(el.getAttribute('data-iv-legend')!==m);});
    try{localStorage.setItem('insrc-theme-mode',m);}catch(e){}
    var t=document.getElementById('iv-theme');if(t)t.setAttribute('aria-pressed',m==='dark'?'true':'false');
  }
  var tb=document.getElementById('iv-theme');if(tb)tb.addEventListener('click',function(){applyMode(mode==='dark'?'light':'dark');});
  applyMode(mode);
  var ex=document.getElementById('iv-export');
  if(ex)ex.addEventListener('click',function(){
    var s=document.querySelector('#docgen-diagram svg');if(!s)return;
    var c=s.cloneNode(true);c.setAttribute('xmlns','http://www.w3.org/2000/svg');
    var out=EXPORT_SVG(new XMLSerializer().serializeToString(c),{bg:SURFACES_BG[mode],style:document.body.getAttribute('data-iv-export-css')||''});
    var a=document.createElement('a');
    a.href='data:image/svg+xml;charset=utf-8,'+encodeURIComponent(out);
    a.download='diagram.svg';a.click();
  });
})();`;
	// The branded page chrome (both light AND dark variants) is composed by the
	// ONE shared helper (R1) — the degraded fallback shell gets the same theme
	// switch as the primary shell, not a single hardcoded mode.
	const pageCss = pageStyleTags(`
  html, body { margin: 0; height: 100%; }
  #docgen-diagram { width: 100%; height: 100vh; background: var(--iv-bg); }
  #docgen-diagram svg { width: 100%; height: 100%; }
  [data-insrc-path] { cursor: pointer; }
`);
	const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="insrc-theme" content="${THEME_VERSION}">
<title>${escapeHtml(ir.scopeDescription)}</title>
${pageCss}
</head>
<body class="insrc-viewer" data-theme="light" data-iv-export-css="${escapeHtml(fontFaceCssForArtifacts() + '\n' + DIAGRAM_OVERRIDES_CSS)}">
<div class="iv-bar"><span>Drag to pan · scroll to zoom</span><span class="sp"></span><button id="iv-theme" aria-label="toggle light/dark theme" aria-pressed="false" title="Toggle light/dark">◐</button><button id="iv-export" aria-label="export svg" title="Export SVG">⇩</button></div>
<div class="iv-err" id="iv-err" role="alert"></div>
<div id="docgen-diagram" class="insrc-viewer-diagram"${diagramStyle}>${svg}</div>${legend}${narrative}
<script>${svgPanZoom}</script>
<script>${CODE_REF_SCRIPT}</script>
<script>${init}</script>
</body>
</html>`;
	return {
		docType:              ir.docType,
		backend:              'fallback-subprocess',
		html,
		inlinedRuntimeVersion: svgPanZoomVersion,
		diagramFormat:        'svg',
		supportsZoomPan:      true,
	};
}
