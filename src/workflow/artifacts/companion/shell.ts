/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * The companion page shell (LLD-d9f85b3c S001/t3).
 *
 * Every companion (ER model, UX mock, sequence diagram, component dependency)
 * is one self-contained HTML page with the same four parts, in order:
 *
 *   Header       project, title, kind badge, and a table of Work item / Source
 *                doc (linked) / Date / User;
 *   Narrative    the context line, then the definition's own narrative if any;
 *   View         the visual inside a pan/zoom panel with a toolbar, fitted on
 *                load (a Mermaid diagram, or HTML such as the UX card);
 *   Description  one or more tables describing the visual's elements.
 *
 * The page opens offline: Mermaid (for a Mermaid visual only) and the pan/zoom
 * runtime are inlined, and no URL other than the relative source-doc link
 * appears. Each kind supplies a CompanionPageContent from a pure builder; this
 * module turns it into HTML and escapes every string it is given, except the
 * HTML visual, which its builder has already escaped.
 */

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { docgenAssetDir } from '../../../docgen/render/shell.js';
import { CODE_REF_SCRIPT } from '../../../docgen/render/code-ref-script.js';
import { DiagramGenerationError } from './render.js';
import { escapeHtml } from './html-escape.js';
import type { CompanionHeader } from './types.js';

// ---------------------------------------------------------------------------
// Page content
// ---------------------------------------------------------------------------

/** A tagged table cell: a short badge (key, call/return, a UX marker number). */
export interface TaggedCell {
	readonly tag:  'pk' | 'fk' | 'call' | 'return' | 'marker';
	readonly text: string;
}

/** One table cell. `null` is "not described" and renders as an em dash. */
export type DescriptionCell = string | TaggedCell | null;

/** One description table, with an optional heading and lead sentence. */
export interface DescriptionBlock {
	readonly heading?: string | undefined;
	readonly lead?:    string | undefined;
	readonly columns:  readonly string[];
	readonly rows:     readonly (readonly DescriptionCell[])[];
}

/** The visual in the view panel. An HTML visual arrives already escaped and may
 *  carry its own CSS (the UX card's). */
export type CompanionVisual =
	| { readonly kind: 'mermaid'; readonly source: string }
	| { readonly kind: 'html'; readonly html: string; readonly style?: string | undefined };

/** What a per-kind builder hands the shell. */
export interface CompanionPageContent {
	/** The page title (the companion's title). */
	readonly title:        string;
	/** The kind badge, e.g. 'Entity–relationship model'. */
	readonly kindLabel:    string;
	/** The definition's own narrative, when it has one. */
	readonly narrative?:   string | undefined;
	readonly visual:       CompanionVisual;
	readonly description:  readonly DescriptionBlock[];
}

/** The inlined runtimes: pan/zoom always, Mermaid for a Mermaid visual only. */
export interface CompanionRuntime {
	readonly panzoom:  string;
	readonly mermaid?: string | undefined;
}

// ---------------------------------------------------------------------------
// Runtime loader
// ---------------------------------------------------------------------------

/** Where the companion runtime assets ship: out/assets/artifacts/companion (or
 *  src/assets/... under tsx), resolved from this module.
 *  out/workflow/artifacts/companion/shell.js → ../../../assets/artifacts/companion */
export const COMPANION_ASSET_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', 'assets', 'artifacts', 'companion');

let assetDirOverride: { companion: string; mermaid: string } | undefined;

/** Test-only: read the runtimes from other dirs (undefined restores the defaults). */
export function _setCompanionRuntimeDirsForTests(dirs?: { companion: string; mermaid: string }): void {
	assetDirOverride = dirs;
}

function readAsset(dir: string, file: string): string {
	try {
		return readFileSync(join(dir, file), 'utf8');
	} catch (err) {
		throw new DiagramGenerationError(
			'runtime-missing',
			`companion runtime asset ${file} could not be read from ${dir} (${(err as Error).message}); ` +
				'rebuild so src/assets ships via copy-assets.mjs',
		);
	}
}

/** Read the runtimes a page needs. Throws DiagramGenerationError when an asset
 *  is missing, before anything is written. */
export function loadCompanionRuntime(visual: CompanionVisual['kind']): CompanionRuntime {
	const companionDir = assetDirOverride?.companion ?? COMPANION_ASSET_DIR;
	const panzoom = readAsset(companionDir, 'panzoom.js');
	if (visual !== 'mermaid') return { panzoom };
	return { panzoom, mermaid: readAsset(assetDirOverride?.mermaid ?? docgenAssetDir(), 'mermaid.min.js') };
}

// ---------------------------------------------------------------------------
// HTML
// ---------------------------------------------------------------------------

const esc = escapeHtml;

/** A script body is inlined raw; this keeps a stray `</script` inside it from
 *  closing the element early. */
function inlineScript(code: string): string {
	return `<script>${code.replace(/<\/(script)/gi, '<\\/$1')}</script>`;
}

const TAG_CLASS: Record<TaggedCell['tag'], string> = {
	pk: 'tag pk', fk: 'tag fk', call: 'tag call', return: 'tag ret', marker: 'pin',
};

function cellHtml(cell: DescriptionCell): string {
	if (cell === null) return '<td class="missing">—</td>';
	if (typeof cell === 'string') return `<td>${esc(cell)}</td>`;
	return `<td><span class="${TAG_CLASS[cell.tag]}">${esc(cell.text)}</span></td>`;
}

function blockHtml(block: DescriptionBlock): string {
	const heading = block.heading !== undefined ? `<h3>${esc(block.heading)}</h3>` : '';
	const lead = block.lead !== undefined ? `<p class="lead">${esc(block.lead)}</p>` : '';
	const head = block.columns.map(c => `<th>${esc(c)}</th>`).join('');
	const rows = block.rows.map(r => `<tr>${r.map(cellHtml).join('')}</tr>`).join('');
	return `${heading}${lead}<table class="dt"><thead><tr>${head}</tr></thead><tbody>${rows}</tbody></table>`;
}

function narrativeHtml(narrative: string | undefined): string {
	if (narrative === undefined || narrative.trim().length === 0) return '';
	return narrative.split(/\n\s*\n/).map(p => p.trim()).filter(p => p.length > 0).map(p => `<p>${esc(p)}</p>`).join('');
}

const PANZOOM_IDS = "viewport:'vp',stage:'stage',zoomLabel:'zl',zoomIn:'zin',zoomOut:'zout',fit:'zfit',reset:'z100'";

/** The page's own boot script. A Mermaid page fits once the diagram is drawn
 *  (its size is unknown until then); an HTML page fits on load. */
function bootScript(visual: CompanionVisual): string {
	if (visual.kind === 'html') {
		return `window.insrcPanZoom.init({${PANZOOM_IDS},fitOnLoad:true});`;
	}
	return [
		`var pz=window.insrcPanZoom.init({${PANZOOM_IDS}});`,
		"mermaid.initialize({startOnLoad:false,securityLevel:'strict',theme:'neutral'});",
		"mermaid.run({querySelector:'#stage pre.mermaid'}).then(function(){",
		"document.querySelectorAll('#stage svg').forEach(function(svg){var vb=svg.viewBox&&svg.viewBox.baseVal;",
		"if(vb&&vb.width){svg.setAttribute('width',vb.width);svg.setAttribute('height',vb.height);svg.style.maxWidth='none';}});",
		'pz.fit();',
		'window.insrcMarkCodeRefs();',
		"}).catch(function(err){document.getElementById('stage').textContent='Diagram could not be drawn: '+err;});",
	].join('');
}

const STYLE = [
	'*{box-sizing:border-box}',
	"body{margin:0;background:#f3f5f8;color:#1b1f24;font:14px/1.55 -apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif}",
	'.page{max-width:1180px;margin:0 auto;padding:28px 28px 48px}',
	'header.hdr{display:flex;justify-content:space-between;align-items:flex-start;gap:24px;padding-bottom:18px;border-bottom:2px solid #1f3a8a}',
	'.hdr .proj{font-size:12px;letter-spacing:.08em;text-transform:uppercase;color:#5b6673;font-weight:600}',
	'.hdr h1{margin:4px 0 0;font-size:24px;color:#0f1d4a}',
	'.hdr .kind{display:inline-block;margin-top:6px;font-size:11px;font-weight:600;color:#1f3a8a;background:#e6ecfb;border-radius:10px;padding:2px 10px}',
	'table.ref{border-collapse:collapse;font-size:13px;min-width:380px}',
	'table.ref th{text-align:left;font-weight:600;color:#44505e;background:#eef1f6;padding:6px 12px;border:1px solid #d6dbe1;width:120px;white-space:nowrap}',
	'table.ref td{padding:6px 12px;border:1px solid #d6dbe1;background:#fff;font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:12.5px}',
	'table.ref a{color:#1f6feb;text-decoration:none}',
	'section.blk{margin-top:26px}',
	'section.blk>h2{font-size:13px;letter-spacing:.07em;text-transform:uppercase;color:#1f3a8a;margin:0 0 10px;padding-bottom:6px;border-bottom:1px solid #d6dbe1}',
	'.context{font-size:13px;color:#44505e;background:#eef1f6;border-left:3px solid #1f3a8a;padding:8px 12px;border-radius:0 4px 4px 0;margin:0 0 10px}',
	'.narr p{margin:0 0 8px;max-width:900px}',
	'.vp-wrap{border:1px solid #c9d0d9;border-radius:8px;background:#fff;overflow:hidden;box-shadow:0 1px 3px rgba(16,22,26,.06)}',
	'.vp-bar{display:flex;align-items:center;gap:6px;padding:6px 10px;background:#f7f8fa;border-bottom:1px solid #e1e5ea;font-size:12px;color:#5b6673}',
	'.vp-bar .sp{flex:1}',
	'.vp-bar button{font:inherit;font-size:12px;border:1px solid #c9d0d9;background:#fff;border-radius:4px;padding:3px 9px;cursor:pointer;color:#1b1f24}',
	'.vp-bar button:hover{background:#eef1f6}',
	'.vp-bar .zl{min-width:44px;text-align:right;font-variant-numeric:tabular-nums}',
	'.vp{position:relative;height:62vh;min-height:380px;overflow:hidden;cursor:grab;background:#fff;background-image:radial-gradient(#e3e7ec 1px,transparent 1px);background-size:18px 18px}',
	'.vp.drag{cursor:grabbing}',
	'.stage{position:absolute;left:0;top:0;transform-origin:0 0;will-change:transform}',
	'.stage pre.mermaid{margin:0;background:transparent}',
	'.desc h3{font-size:14px;margin:18px 0 8px;color:#0f1d4a}',
	'.desc p.lead{margin:0 0 10px;color:#44505e}',
	'table.dt{border-collapse:collapse;width:100%;font-size:13px;background:#fff;margin-bottom:6px}',
	'table.dt th{text-align:left;background:#eef1f6;color:#44505e;font-weight:600;padding:7px 10px;border:1px solid #d6dbe1}',
	'table.dt td{padding:7px 10px;border:1px solid #d6dbe1;vertical-align:top}',
	'td.missing{color:#9aa4af}',
	'[data-insrc-path]{cursor:pointer}',
	'.tag{display:inline-block;font-size:11px;border-radius:9px;padding:1px 8px;background:#eef1f6;color:#44505e}',
	'.tag.pk{background:#fde9c9;color:#8a5300}.tag.fk{background:#dcebff;color:#174ea6}',
	'.tag.call{background:#e6ecfb;color:#1f3a8a}.tag.ret{background:#e7f5ea;color:#1a7f37}',
	'.pin{display:inline-block;min-width:18px;height:18px;line-height:18px;border-radius:9px;background:#cf6a00;color:#fff;font-size:10px;font-weight:700;text-align:center}',
	'footer.ft{margin-top:30px;padding-top:10px;border-top:1px dashed #c9d0d9;font-size:12px;color:#8b95a1;display:flex;justify-content:space-between}',
].join('');

/**
 * Render one companion page. Pure apart from its inputs: the same header,
 * content and runtime always give the same string.
 */
export function renderCompanionPage(header: CompanionHeader, page: CompanionPageContent, runtime: CompanionRuntime): string {
	const visual = page.visual;
	const visualHtml = visual.kind === 'mermaid'
		? `<pre class="mermaid">${esc(visual.source)}</pre>`
		: visual.html;
	const visualStyle = visual.kind === 'html' && visual.style !== undefined ? visual.style : '';
	const scripts = [
		...(visual.kind === 'mermaid' && runtime.mermaid !== undefined ? [inlineScript(runtime.mermaid)] : []),
		inlineScript(runtime.panzoom),
		inlineScript(CODE_REF_SCRIPT),
		inlineScript(bootScript(visual)),
	].join('\n');
	const description = page.description.length > 0
		? page.description.map(blockHtml).join('')
		: '<p class="lead">No elements to describe.</p>';

	return `<!doctype html>
<html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(header.projectName)} · ${esc(page.title)}</title>
<style>${STYLE}${visualStyle}</style></head>
<body><div class="page">
<header class="hdr">
<div><div class="proj">${esc(header.projectName)}</div><h1>${esc(page.title)}</h1><span class="kind">${esc(page.kindLabel)}</span></div>
<table class="ref">
<tr><th>Work item</th><td>${esc(header.workItemId)}</td></tr>
<tr><th>Source doc</th><td><a href="${esc(header.sourceDoc.href)}">${esc(header.sourceDoc.id)}</a></td></tr>
<tr><th>Date</th><td>${esc(header.date)}</td></tr>
<tr><th>User</th><td>${esc(header.user)}</td></tr>
</table>
</header>
<section class="blk narr"><h2>Narrative</h2><p class="context">${esc(header.contextLine)}</p>${narrativeHtml(page.narrative)}</section>
<section class="blk"><h2>View</h2><div class="vp-wrap">
<div class="vp-bar"><span>Drag to pan · scroll to zoom · double-click to zoom in</span><span class="sp"></span><button id="zout" title="Zoom out">−</button><span class="zl" id="zl">100%</span><button id="zin" title="Zoom in">+</button><button id="zfit" title="Fit to view">Fit</button><button id="z100" title="Actual size">1:1</button></div>
<div class="vp" id="vp"><div class="stage" id="stage">${visualHtml}</div></div>
</div></section>
<section class="blk desc"><h2>Description</h2>${description}</section>
<footer class="ft"><span>Generated by insrc · companion of ${esc(header.sourceDoc.id)}</span><span>${esc(header.date)}</span></footer>
</div>
${scripts}
</body></html>
`;
}
