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

import type { DocumentIR, IrEdge, IrSection, RenderedDocumentShell } from '../types.js';
import { ok, fallbackUnavailable } from '../outcome.js';
import type { DocGenOutcome } from '../types.js';
import {
	oversized,
	toGraphvizDot,
	assembleFallbackShell,
	graphvizSubprocessRenderer,
	type SubprocessRenderer,
} from './fallback.js';

/** The single source of truth for where the docgen runtime assets live
 *  (out/assets/docgen, resolved from import.meta.url). Both the renderer
 *  (loadRuntime) and the boot-time asset validator (validateDocgenAssets, s7)
 *  read from here, so they can never disagree about the asset location.
 *  out/docgen/render/shell.js → ../../assets/docgen */
export const DOCGEN_ASSET_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'assets', 'docgen');

/** Test-only override of the asset dir, shared by loadRuntime +
 *  resolveDocgenRuntimeManifest + the s7 validator so a test can point ALL of
 *  them at a temp dir at once. Undefined in production → DOCGEN_ASSET_DIR. */
let assetDirOverride: string | undefined;
export function _setDocgenAssetDirForTests(dir?: string): void { assetDirOverride = dir; runtimeCache = undefined; }

/** The docgen asset dir currently in effect (the test override when set, else
 *  DOCGEN_ASSET_DIR). The one resolver every asset read goes through. */
export function docgenAssetDir(): string { return assetDirOverride ?? DOCGEN_ASSET_DIR; }

export interface RuntimeManifest {
	readonly mermaidVersion:    string;
	readonly svgPanZoomVersion: string;
	readonly mermaidAsset:      string;
	readonly svgPanZoomAsset:   string;
}

/** Read + parse runtime.json from the docgen asset dir. The SINGLE manifest read
 *  both loadRuntime (renderer) and validateDocgenAssets (boot check) share, so
 *  there is no second notion of the manifest's location or shape (s7 · t1). */
export async function resolveDocgenRuntimeManifest(): Promise<RuntimeManifest> {
	return JSON.parse(await readFile(join(docgenAssetDir(), 'runtime.json'), 'utf8')) as RuntimeManifest;
}

let runtimeCache: { manifest: RuntimeManifest; mermaid: string; svgPanZoom: string } | undefined;

/** Load + cache the vendored runtime (manifest + both minified bundles). The
 *  manifest comes via the shared resolveDocgenRuntimeManifest(); the bundle
 *  reads resolve against the same docgenAssetDir(). Unchanged behaviour: same
 *  resolved path, same contents, same memoization. */
async function loadRuntime(): Promise<{ manifest: RuntimeManifest; mermaid: string; svgPanZoom: string }> {
	if (runtimeCache !== undefined) return runtimeCache;
	const manifest = await resolveDocgenRuntimeManifest();
	const dir = docgenAssetDir();
	const [mermaid, svgPanZoom] = await Promise.all([
		readFile(join(dir, manifest.mermaidAsset), 'utf8'),
		readFile(join(dir, manifest.svgPanZoomAsset), 'utf8'),
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

/** sequenceDiagram source (call-sequence): one participant per 'call-frame'
 *  node, one `A->>B` message per ordered 'calls' edge, a `Note over B` for a
 *  cycle-repeat step (edge id carries a ':repeat' suffix) and a `Note over F`
 *  for each 'truncation' marker (which cites the frame F it attaches to). The
 *  ordered edge list IS the call order (ac1); the notes show repetition (ac2)
 *  and depth-truncation (ac3) in the document. */
function toSequenceDiagram(ir: DocumentIR, alias: ReadonlyMap<string, string>): string {
	const lines: string[] = ['sequenceDiagram'];
	for (const n of ir.derived.nodes) {
		if (n.kind === 'call-frame') lines.push(`  participant ${alias.get(n.id)!} as ${escapeLabel(n.label)}`);
	}
	for (const e of ir.derived.edges) {
		const from = alias.get(e.from);
		const to   = alias.get(e.to);
		if (from === undefined || to === undefined) continue;
		lines.push(`  ${from}->>${to}: call`);
		if (e.id.endsWith(':repeat')) lines.push(`  Note over ${to}: recursion`);
	}
	for (const n of ir.derived.nodes) {
		if (n.kind !== 'truncation') continue;
		const frame = n.citation?.entityId !== undefined ? alias.get(n.citation.entityId) : undefined;
		if (frame !== undefined) lines.push(`  Note over ${frame}: ${escapeLabel(n.label)}`);
	}
	return lines.join('\n');
}

/**
 * Emit Mermaid source from the DERIVED IR, dispatching on docType: a
 * `classDiagram` for type-structure (inheritance), a `flowchart` for
 * component-dependency, a `sequenceDiagram` for call-sequence. Nodes get stable
 * short aliases (n0, n1, …) so the graph-derived entity ids never clash with
 * Mermaid identifier syntax; the real name rides in the label. Pure +
 * deterministic (alias order follows node order).
 */
export function documentIRToMermaid(ir: DocumentIR): string {
	const alias = new Map<string, string>();
	ir.derived.nodes.forEach((n, i) => alias.set(n.id, `n${i}`));
	// docType literal used here to avoid an extractor→shell import cycle.
	if (ir.docType === 'call-sequence') return toSequenceDiagram(ir, alias);
	// 'component-dependency' → flowchart; every other docType → classDiagram.
	return ir.docType === 'component-dependency' ? toFlowchart(ir, alias) : toClassDiagram(ir, alias);
}

// ── HTML shell ────────────────────────────────────────────────────────────────

function escapeHtml(s: string): string {
	return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/** Render narrated sections (s4) into a self-contained, visually distinct region
 *  (ac3): a labelled band with a coloured top border, all styles inline so the
 *  document stays offline (ac5). Returns '' for a derived-only document so its
 *  HTML is byte-identical to the pre-s4 shell (s1/s2/s3 unaffected). */
function renderNarrative(sections: readonly IrSection[]): string {
	if (sections.length === 0) return '';
	const blocks = sections.map(s =>
		`<section style="margin:0 0 1rem 0"><h3 style="margin:.2rem 0">${escapeHtml(s.title)}</h3>` +
		`<p style="margin:.2rem 0;white-space:pre-wrap">${escapeHtml(s.narrativeText)}</p></section>`,
	).join('\n');
	return `\n<div id="docgen-narrative" style="padding:12px 16px;border-top:3px solid #4051b5;background:#f6f7fb;font-size:14px;line-height:1.5">\n` +
		`<h2 style="margin:.3rem 0;color:#4051b5">Narrative <span style="font-weight:normal;font-size:12px;color:#666">(LLM-authored — the diagram above is derived from the code)</span></h2>\n` +
		`${blocks}\n</div>`;
}

/** Build the self-contained HTML document. Both runtimes are inlined; there is
 *  no external URL anywhere in the output. When `sections` is non-empty a
 *  distinct narrated region is appended below the diagram (s4); an empty
 *  `sections` yields byte-identical output to the pre-s4 shell. */
function buildHtml(
	title: string,
	mermaidSource: string,
	mermaid: string,
	svgPanZoom: string,
	sections: readonly IrSection[],
): string {
	const narrative = renderNarrative(sections);
	// A narrative doc shares the viewport between diagram + prose; a derived-only
	// doc keeps the full-height diagram (no inline style → byte-identical).
	const diagramStyle = narrative !== '' ? ' style="height:65vh"' : '';
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
<div id="docgen-diagram"${diagramStyle}><pre class="mermaid">${escapeHtml(mermaidSource)}</pre></div>${narrative}
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
 *
 * Oversized dispatch (s5): a diagram too large for the primary Mermaid layout
 * (`oversized(ir)`) is rendered via the injected subprocess `renderer` (Graphviz
 * `dot` / `d2`) into the SAME sc3 offline shell (`backend: 'fallback-subprocess'`),
 * or reported `fallback-unavailable` naming the tried binaries when no renderer
 * is present (ac1/ac3). A non-oversized diagram takes the unchanged primary
 * inline path and is byte-identical to the pre-s5 output — the subprocess
 * `renderer` is never invoked (ac4/k9). `renderer` defaults to the production
 * seam and is injectable for tests.
 */
export async function assembleShell(
	ir: DocumentIR,
	renderer: SubprocessRenderer = graphvizSubprocessRenderer,
): Promise<DocGenOutcome<RenderedDocumentShell>> {
	let runtime: { manifest: RuntimeManifest; mermaid: string; svgPanZoom: string };
	try {
		runtime = await loadRuntime();
	} catch (err) {
		return fallbackUnavailable(
			`docgen offline runtime asset missing (${(err as Error).message})`,
			`ensure src/assets/docgen/{mermaid.min.js,svg-pan-zoom.min.js,runtime.json} ship via copy-assets.mjs into out/assets/docgen/`,
		);
	}
	// Oversized scope → subprocess fallback into the identical sc3 shell (s5).
	if (oversized(ir)) {
		const result = await renderer.renderSvg(toGraphvizDot(ir));
		if (result.status === 'ok') {
			return ok(assembleFallbackShell(ir, result.svg, runtime.svgPanZoom, runtime.manifest.svgPanZoomVersion));
		}
		return fallbackUnavailable(
			`docgen diagram too large for the primary renderer and no subprocess renderer is available ` +
				`(tried ${result.triedBinaries.join(', ') || 'none'}${result.reason ? `; ${result.reason}` : ''})`,
			`install graphviz (provides 'dot') or d2 to enable the oversized-diagram fallback renderer`,
		);
	}
	// Primary inline path — unchanged (byte-identical for non-oversized docs).
	const mermaidSource = documentIRToMermaid(ir);
	const html = buildHtml(ir.scopeDescription, mermaidSource, runtime.mermaid, runtime.svgPanZoom, ir.narrated.sections);
	return ok<RenderedDocumentShell>({
		docType:              ir.docType,
		backend:              'primary-inline',
		html,
		inlinedRuntimeVersion: runtime.manifest.mermaidVersion,
		diagramFormat:        'svg',
		supportsZoomPan:      true,
	});
}
