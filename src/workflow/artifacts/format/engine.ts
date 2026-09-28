/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * sc3 (S002) — the shared render engine every per-type renderer drives.
 *
 * `renderFromFormat` turns a `DocumentFormat` + per-section content bindings into
 * the document markdown: a short H1, an unnumbered Summary + generated Contents,
 * then the body sections in declared order — each carrying an ENGINE-COMPUTED
 * section number (`N`) or nested number (`N.M`) as LITERAL text (Markdown has no
 * native decimal numbering, so portability requires emitting the digits).
 *
 * Numbering is deterministic (`computeSectionNumbers`); anchors are stable
 * (`sectionSlug`, collision-disambiguated); a shared upstream section renders as a
 * reference line (`renderSharedContextReference`), never copied prose (ac2/k1).
 */

import type { DocumentFormat, SectionSpec, SharedContextRef } from './types.js';

/** The content a renderer supplies for one section. Empty → heading with no body. */
export interface SectionContent {
	/** Plain body lines. */
	readonly lines?: readonly string[] | undefined;
	/** Repeatable per-item sub-blocks (stories/tasks/api/…), nested-numbered N.M. */
	readonly items?: readonly SectionItem[] | undefined;
	/** For a source:'shared-ref' section — the upstream reference to render. */
	readonly ref?: SharedContextRef | undefined;
	/** Skip this section entirely (an absent optional section). */
	readonly omit?: boolean | undefined;
}

/** One nested item under a section (its `title` follows the `N.M` number). */
export interface SectionItem {
	readonly title: string;
	readonly lines: readonly string[];
}

export type SectionBinding  = () => SectionContent;
export type SectionBindings = Readonly<Record<string, SectionBinding>>;

/** Envelope inputs the renderer supplies once per document. */
export interface RenderCtx {
	/** The resolved short H1 text (no leading '# '). */
	readonly h1:        string;
	/** An already-formatted artifact-id marker line, or undefined. */
	readonly marker?:   string | undefined;
	/** Default HLD-context reference for a shared-ref section that supplies none. */
	readonly defaultRef?: SharedContextRef | undefined;
}

const NONE = '_None._';

/** A deterministic lowercase-kebab slug for a heading, optionally number-prefixed. */
export function sectionSlug(heading: string, ordinal?: string): string {
	const base = heading
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, '-')
		.replace(/^-+|-+$/g, '');
	return ordinal !== undefined && ordinal.length > 0
		? `${ordinal.replace(/\./g, '')}-${base}`
		: base;
}

/**
 * Map each NUMBERED body section id to its literal ordinal ('1', '2', …), in the
 * format's declared order. Envelope + unnumbered sections are absent from the map.
 * Per-item `N.M` numbers are computed at render time (the item count is data-driven).
 */
export function computeSectionNumbers(format: DocumentFormat): ReadonlyMap<string, string> {
	const out = new Map<string, string>();
	let n = 0;
	for (const s of format.sections) {
		if (!s.numbered) continue;
		n += 1;
		out.set(s.id, String(n));
	}
	return out;
}

/** Render a shared-context reference LINE (the de-dup rendering, ac2) — names the
 *  source artifact id + the human section, never the copied prose (k1). */
export function renderSharedContextReference(ref: SharedContextRef): string {
	const m = /^(\d+)-(.*)$/.exec(ref.sectionId);
	const num  = m !== null ? `${m[1]}. ` : '';
	const rest = (m !== null ? m[2]! : ref.sectionId).replace(/-/g, ' ').trim();
	const human = rest.length > 0 ? rest.charAt(0).toUpperCase() + rest.slice(1) : rest;
	return `> See **${ref.sourceArtifactId}** § ${num}${human}`;
}

/** The engine-derived default HLD-context reference for an LLD with no explicit
 *  `contextRefs` — deterministic from the Epic hash (storage id scheme: HLD-<hash>). */
export function deriveHldContextRef(epicHash: string): SharedContextRef {
	return { sourceArtifactId: `HLD-${epicHash}`, sectionId: '2-framework-summary' };
}

/**
 * Render a full document from its format + per-section bindings.
 * Throws when a `required` section (source:'body'|'fr') has no binding — a
 * format/renderer drift caught fail-fast in dev/CI.
 */
export function renderFromFormat(
	format:   DocumentFormat,
	bindings: SectionBindings,
	ctx:      RenderCtx,
): string {
	// Resolve each body section's content ONCE, so the Contents index + the body
	// agree on what actually renders (a skipped optional section is in neither).
	const rendered: { readonly spec: SectionSpec; readonly content: SectionContent; readonly ordinal?: string }[] = [];
	let n = 0;
	for (const s of format.sections) {
		const content = resolveContent(s, bindings);
		if (content === undefined) continue; // skipped (absent-safe optional)
		let ordinal: string | undefined;
		if (s.numbered) { n += 1; ordinal = String(n); }
		rendered.push({ spec: s, content, ...(ordinal !== undefined ? { ordinal } : {}) });
	}

	const lines: string[] = [];
	if (ctx.marker !== undefined && ctx.marker.length > 0) { lines.push(ctx.marker, ''); }
	lines.push(`# ${ctx.h1}`, '');

	// Envelope: Summary (unnumbered abstract). Rendered only when bound.
	const summaryContent = resolveContent(format.summary, bindings);
	if (summaryContent !== undefined) emitSection(format.summary, summaryContent, undefined, ctx, lines);

	// Envelope: Contents — a numbered index of the rendered numbered body sections.
	lines.push('## Contents', '');
	for (const r of rendered) {
		if (r.ordinal === undefined) continue;
		lines.push(`${r.ordinal}. [${r.spec.heading}](#${sectionSlug(r.spec.heading, r.ordinal)})`);
	}
	lines.push('');

	// Body sections in declared order.
	for (const r of rendered) emitSection(r.spec, r.content, r.ordinal, ctx, lines);

	// Trim a trailing blank.
	while (lines.length > 0 && lines[lines.length - 1] === '') lines.pop();
	return lines.join('\n') + '\n';
}

/** Resolve a section's content, or `undefined` when it is skipped (absent-safe).
 *  Throws when a required body/fr section has no binding (format/renderer drift). */
function resolveContent(spec: SectionSpec, bindings: SectionBindings): SectionContent | undefined {
	const binding = bindings[spec.id];
	if (binding === undefined) {
		if (spec.required && (spec.source === 'body' || spec.source === 'fr')) {
			throw new Error(`renderFromFormat: required section '${spec.id}' (${spec.heading}) has no binding`);
		}
		return undefined;
	}
	const content = binding();
	return content.omit === true ? undefined : content;
}

function emitSection(
	spec:    SectionSpec,
	content: SectionContent,
	ordinal: string | undefined,
	ctx:     RenderCtx,
	out:     string[],
): void {
	out.push(ordinal !== undefined ? `## ${ordinal}. ${spec.heading}` : `## ${spec.heading}`, '');

	if (spec.source === 'shared-ref') {
		const ref = content.ref ?? ctx.defaultRef;
		out.push(ref !== undefined ? renderSharedContextReference(ref) : NONE, '');
		return;
	}
	const items = content.items ?? [];
	const body  = content.lines ?? [];
	if (items.length === 0 && body.length === 0) { out.push(NONE, ''); return; }
	for (const l of body) out.push(l);
	if (body.length > 0) out.push('');
	items.forEach((item, i) => {
		const itemNum = ordinal !== undefined ? `${ordinal}.${i + 1}` : String(i + 1);
		out.push(`### ${itemNum} ${item.title}`, '');
		for (const l of item.lines) out.push(l);
		out.push('');
	});
}
