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
 */
export function assembleFallbackShell(
	ir: DocumentIR,
	svg: string,
	svgPanZoom: string,
	svgPanZoomVersion: string,
): RenderedDocumentShell {
	const init = `
(function () {
  var svg = document.querySelector('#docgen-diagram svg');
  if (svg && window.svgPanZoom) {
    svg.setAttribute('width', '100%'); svg.setAttribute('height', '100%');
    svg.style.maxWidth = 'none';
    window.svgPanZoom(svg, { controlIconsEnabled: true, fit: true, center: true, minZoom: 0.2, maxZoom: 20 });
  }
})();`;
	const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(ir.scopeDescription)}</title>
<style>
  html, body { margin: 0; height: 100%; font-family: system-ui, sans-serif; }
  #docgen-diagram { width: 100%; height: 100vh; }
  #docgen-diagram svg { width: 100%; height: 100%; }
  #docgen-error { color: #b00020; padding: 8px; font-family: monospace; }
</style>
</head>
<body>
<div id="docgen-error"></div>
<div id="docgen-diagram">${svg}</div>
<script>${svgPanZoom}</script>
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
