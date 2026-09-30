/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * docgen — the shared narrated-band renderer.
 *
 * Both render paths (the primary inline shell in render/shell.ts and the
 * oversized subprocess fallback in render/fallback.ts) render the SAME
 * self-contained narrated band — a labelled region with a coloured top border,
 * all styles inline so the document stays offline. This module owns that one
 * renderer so the two shells share it without either importing the other
 * (shell.ts imports from fallback.ts — the dispatch direction — so the shared
 * band must live in a third module both may import).
 *
 * The band carries the LLM/definition-authored `narrated.sections` (each a
 * title + prose) and, optionally, an escaped `<a>` back-reference to the source
 * artifact markdown (`narrated.sourceLink`). Both section text and the link
 * label/href are escaped, so no graph-/author-derived string can inject markup
 * and no external URL is introduced (the href is a relative sibling path).
 *
 * Byte-identity: an EMPTY `sections` array AND an absent `sourceLink` yields ''
 * (a derived-only document renders byte-identically to the pre-narrative shell);
 * and for a sections-only band (no sourceLink) the output is identical to the
 * former shell-local renderNarrative.
 */

import type { IrSection } from '../types.js';

/** Escape HTML text content: `&`, `<`, `>` (matches the shells' escapeHtml). */
function escapeHtml(s: string): string {
	return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/** Escape a value destined for a double-quoted HTML attribute: the text escapes
 *  plus the double quote, so a value containing `"` cannot break out of the
 *  attribute. */
function escapeAttr(s: string): string {
	return escapeHtml(s).replace(/"/g, '&quot;');
}

/**
 * Render the narrated band. Returns '' when there is nothing to show (no
 * sections AND no source link) so the enclosing document stays byte-identical to
 * the pre-narrative shell. When a `sourceLink` is present an escaped `<a>` is
 * rendered directly under the band heading; when it is absent the output is
 * identical to a sections-only band.
 */
export function renderNarrativeBand(
	sections: readonly IrSection[],
	sourceLink?: { readonly label: string; readonly href: string } | undefined,
): string {
	if (sections.length === 0 && sourceLink === undefined) return '';
	const link = sourceLink === undefined ? '' :
		`<p style="margin:.2rem 0"><a href="${escapeAttr(sourceLink.href)}" style="color:#4051b5">${escapeHtml(sourceLink.label)}</a></p>\n`;
	const blocks = sections.map(s =>
		`<section style="margin:0 0 1rem 0"><h3 style="margin:.2rem 0">${escapeHtml(s.title)}</h3>` +
		`<p style="margin:.2rem 0;white-space:pre-wrap">${escapeHtml(s.narrativeText)}</p></section>`,
	).join('\n');
	return `\n<div id="docgen-narrative" style="padding:12px 16px;border-top:3px solid #4051b5;background:#f6f7fb;font-size:14px;line-height:1.5">\n` +
		`<h2 style="margin:.3rem 0;color:#4051b5">Narrative <span style="font-weight:normal;font-size:12px;color:#666">(LLM-authored — the diagram above is derived from the code)</span></h2>\n` +
		`${link}${blocks}\n</div>`;
}
