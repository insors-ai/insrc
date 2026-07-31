/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * docgen — RenderedDocumentShell assembly (Epic 870ed3dd, Story s1 · t6).
 *
 * Turns a DERIVED DocumentIR into a single self-contained offline HTML file:
 * the diagram is emitted as Mermaid source, the Mermaid + svg-pan-zoom runtimes
 * are INLINED from the locally-shipped assets (never a CDN fetch — k5/ac2), and
 * the rendered SVG gets zoom/pan (ac3). The runtime bytes are read at assembly
 * time from `out/assets/docgen/` (staged by copy-assets.mjs, s1 · t9), so this
 * module carries no megabyte payload of its own.
 *
 * The primary inline backend is Phase A's only renderer; the identical shell
 * shape is what the s5 subprocess fallback must later reproduce.
 */

import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import type { DocumentIR, IrEdge, RenderedDocumentShell } from '../types.js';
import { ok, fallbackUnavailable } from '../outcome.js';
import type { DocGenOutcome } from '../types.js';

// out/docgen/render/shell.js → ../../assets/docgen
const ASSET_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'assets', 'docgen');

interface RuntimeManifest {
	readonly mermaidVersion:    string;
	readonly svgPanZoomVersion: string;
	readonly mermaidAsset:      string;
	readonly svgPanZoomAsset:   string;
}

let runtimeCache: { manifest: RuntimeManifest; mermaid: string; svgPanZoom: string } | undefined;

/** Load + cache the vendored runtime (manifest + both minified bundles). */
async function loadRuntime(): Promise<{ manifest: RuntimeManifest; mermaid: string; svgPanZoom: string }> {
	if (runtimeCache !== undefined) return runtimeCache;
	const manifest = JSON.parse(await readFile(join(ASSET_DIR, 'runtime.json'), 'utf8')) as RuntimeManifest;
	const [mermaid, svgPanZoom] = await Promise.all([
		readFile(join(ASSET_DIR, manifest.mermaidAsset), 'utf8'),
		readFile(join(ASSET_DIR, manifest.svgPanZoomAsset), 'utf8'),
	]);
	runtimeCache = { manifest, mermaid, svgPanZoom };
	return runtimeCache;
}

/** Reset the runtime cache (tests). */
export function _resetRuntimeCacheForTests(): void { runtimeCache = undefined; }

// ── Mermaid emission ─────────────────────────────────────────────────────────

/** A Mermaid classDiagram relation for one inheritance edge. INHERITS
 *  (from=Derived, to=Base) renders `Base <|-- Derived`; IMPLEMENTS renders the
 *  dashed `Interface <|.. Impl`. */
function edgeLine(edge: IrEdge, alias: ReadonlyMap<string, string>): string | undefined {
	const from = alias.get(edge.from);
	const to   = alias.get(edge.to);
	if (from === undefined || to === undefined) return undefined;
	const arrow = edge.kind === 'implements' ? '<|..' : '<|--';
	return `  ${to} ${arrow} ${from}`;
}

/** Escape a label for a Mermaid `class alias["label"]` declaration. */
function escapeLabel(label: string): string {
	// Mermaid reads the quoted label; strip the quote/backtick + collapse newlines.
	return label.replace(/["`\r\n]/g, ' ').trim();
}

/** classDiagram source (type-structure): class decls + inherit/implement arrows. */
function toClassDiagram(ir: DocumentIR, alias: ReadonlyMap<string, string>): string {
	const lines: string[] = ['classDiagram'];
	for (const n of ir.derived.nodes) {
		const a = alias.get(n.id)!;
		lines.push(`  class ${a}["${escapeLabel(n.label)}"]`);
		if (n.kind === 'interface') lines.push(`  <<interface>> ${a}`);
	}
	for (const e of ir.derived.edges) {
		const line = edgeLine(e, alias);
		if (line !== undefined) lines.push(line);
	}
	return lines.join('\n');
}

/** flowchart source (component-dependency): a box per component + `A --> B`
 *  dependency arrows. Isolated components render as edge-less boxes (ac3). */
function toFlowchart(ir: DocumentIR, alias: ReadonlyMap<string, string>): string {
	const lines: string[] = ['flowchart LR'];
	for (const n of ir.derived.nodes) {
		lines.push(`  ${alias.get(n.id)!}["${escapeLabel(n.label)}"]`);
	}
	for (const e of ir.derived.edges) {
		const from = alias.get(e.from);
		const to   = alias.get(e.to);
		if (from !== undefined && to !== undefined) lines.push(`  ${from} --> ${to}`);
	}
	return lines.join('\n');
}

/**
 * Emit Mermaid source from the DERIVED IR, dispatching on docType: a
 * `classDiagram` for type-structure (inheritance), a `flowchart` for
 * component-dependency. Nodes get stable short aliases (n0, n1, …) so the
 * graph-derived entity ids never clash with Mermaid identifier syntax; the real
 * name rides in the label. Pure + deterministic (alias order follows node order).
 */
export function documentIRToMermaid(ir: DocumentIR): string {
	const alias = new Map<string, string>();
	ir.derived.nodes.forEach((n, i) => alias.set(n.id, `n${i}`));
	// 'component-dependency' → flowchart; every other docType → classDiagram.
	// (docType literal used here to avoid an extractor→shell import cycle.)
	return ir.docType === 'component-dependency' ? toFlowchart(ir, alias) : toClassDiagram(ir, alias);
}

// ── HTML shell ────────────────────────────────────────────────────────────────

function escapeHtml(s: string): string {
	return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/** Build the self-contained HTML document. Both runtimes are inlined; there is
 *  no external URL anywhere in the output. */
function buildHtml(title: string, mermaidSource: string, mermaid: string, svgPanZoom: string): string {
	const init = `
mermaid.initialize({ startOnLoad: false, securityLevel: 'strict', theme: 'neutral' });
(async () => {
  try {
    await mermaid.run({ querySelector: '.mermaid' });
    var svg = document.querySelector('#docgen-diagram svg');
    if (svg && window.svgPanZoom) {
      svg.setAttribute('width', '100%'); svg.setAttribute('height', '100%');
      svg.style.maxWidth = 'none';
      window.svgPanZoom(svg, { controlIconsEnabled: true, fit: true, center: true, minZoom: 0.2, maxZoom: 20 });
    }
  } catch (e) { document.getElementById('docgen-error').textContent = 'diagram render failed: ' + e; }
})();`;
	return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(title)}</title>
<style>
  html, body { margin: 0; height: 100%; font-family: system-ui, sans-serif; }
  #docgen-diagram { width: 100%; height: 100vh; }
  #docgen-diagram svg { width: 100%; height: 100%; }
  #docgen-error { color: #b00020; padding: 8px; font-family: monospace; }
</style>
</head>
<body>
<div id="docgen-error"></div>
<div id="docgen-diagram"><pre class="mermaid">${escapeHtml(mermaidSource)}</pre></div>
<script>${mermaid}</script>
<script>${svgPanZoom}</script>
<script>${init}</script>
</body>
</html>`;
}

/**
 * Assemble a RenderedDocumentShell from a DocumentIR. Reads the locally-shipped
 * Mermaid + svg-pan-zoom runtimes and inlines them; if the runtime asset is
 * missing from the build output, returns `fallback-unavailable` naming the
 * copy-assets ship step (never a CDN fetch — ac2).
 */
export async function assembleShell(ir: DocumentIR): Promise<DocGenOutcome<RenderedDocumentShell>> {
	let runtime: { manifest: RuntimeManifest; mermaid: string; svgPanZoom: string };
	try {
		runtime = await loadRuntime();
	} catch (err) {
		return fallbackUnavailable(
			`docgen offline runtime asset missing (${(err as Error).message})`,
			`ensure src/assets/docgen/{mermaid.min.js,svg-pan-zoom.min.js,runtime.json} ship via copy-assets.mjs into out/assets/docgen/`,
		);
	}
	const mermaidSource = documentIRToMermaid(ir);
	const html = buildHtml(ir.scopeDescription, mermaidSource, runtime.mermaid, runtime.svgPanZoom);
	return ok<RenderedDocumentShell>({
		docType:              ir.docType,
		backend:              'primary-inline',
		html,
		inlinedRuntimeVersion: runtime.manifest.mermaidVersion,
		diagramFormat:        'svg',
		supportsZoomPan:      true,
	});
}
