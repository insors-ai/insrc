/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * sc3 (S002, a2) — the editable FORMAT-template file encoding.
 *
 * A `DocumentFormat` is authored/overridden as a human-editable markdown file
 * (the a2 "editable per-type template files on the template-loader cascade"
 * decision). Each section is a `<!-- insrc:… -->` directive comment carrying the
 * machine fields (id / source / audience / required / numbered), followed by a
 * markdown heading (its `heading`) and the section's `contentGuidance` prose.
 *
 * The file is deliberately markdown (readable + diff-friendly + editable) yet
 * deterministically parseable — no fragile heading-inference. `formatToTemplate`
 * and `parseFormatTemplate` round-trip: parse(serialize(fmt)) deep-equals fmt.
 * The in-code `defaultFormat(kind)` constants (formats.ts) remain the oracle —
 * the bundled files are generated from them and a test asserts the round-trip.
 */

import type { Audience, DocumentFormat, ItemFormat, SectionSource, SectionSpec } from './types.js';

const FORMAT_VERSION = 'v1';
const KINDS = ['define', 'hld', 'lld', 'plan'] as const;
const SOURCES: readonly SectionSource[] = ['body', 'shared-ref', 'fr', 'extension'];
const AUDIENCES: readonly Audience[] = ['business', 'product', 'technical'];

// ---------------------------------------------------------------------------
// Serialize — DocumentFormat -> editable markdown template text
// ---------------------------------------------------------------------------

function directive(role: string, spec: SectionSpec): string {
	const attrs: string[] = [`id=${spec.id}`, `source=${spec.source}`];
	if (spec.audience !== undefined) attrs.push(`audience=${spec.audience}`);
	if (spec.required) attrs.push('required');
	if (spec.numbered) attrs.push('numbered');
	return `<!-- insrc:${role} ${attrs.join(' ')} -->`;
}

function serializeSection(role: string, headingLevel: string, spec: SectionSpec): string[] {
	const out = [directive(role, spec), `${headingLevel} ${spec.heading}`];
	if (spec.contentGuidance.length > 0) out.push('', spec.contentGuidance);
	out.push('');
	return out;
}

/** Serialize a DocumentFormat to its editable markdown template text. */
export function formatToTemplate(fmt: DocumentFormat): string {
	const lines: string[] = [`<!-- insrc:format ${FORMAT_VERSION} kind=${fmt.kind} -->`, '', `# ${fmt.h1}`, ''];
	lines.push(...serializeSection('summary', '##', fmt.summary));
	for (const s of fmt.sections) lines.push(...serializeSection('section', '##', s));
	if (fmt.itemFormat !== undefined) {
		lines.push(`<!-- insrc:itemFormat kind=${fmt.itemFormat.itemKind} -->`, '');
		for (const s of fmt.itemFormat.sections) lines.push(...serializeSection('item-section', '###', s));
	}
	// Collapse any accidental trailing blank run to a single newline.
	return lines.join('\n').replace(/\n+$/, '\n');
}

// ---------------------------------------------------------------------------
// Parse — editable markdown template text -> DocumentFormat
// ---------------------------------------------------------------------------

export class FormatTemplateParseError extends Error {}

const HEADER_RE = /^<!--\s*insrc:format\s+(\S+)\s+kind=(\S+)\s*-->$/;
const DIRECTIVE_RE = /^<!--\s*insrc:(summary|section|itemFormat|item-section)\s+(.*?)\s*-->$/;

interface Attrs {
	readonly id?: string | undefined;
	readonly source?: string | undefined;
	readonly audience?: string | undefined;
	readonly required: boolean;
	readonly numbered: boolean;
	readonly itemKind?: string | undefined;
}

function parseAttrs(raw: string): Attrs {
	let id: string | undefined;
	let source: string | undefined;
	let audience: string | undefined;
	let itemKind: string | undefined;
	let required = false;
	let numbered = false;
	for (const tok of raw.split(/\s+/).filter(t => t.length > 0)) {
		const eq = tok.indexOf('=');
		if (eq === -1) {
			if (tok === 'required') required = true;
			else if (tok === 'numbered') numbered = true;
			else throw new FormatTemplateParseError(`unknown directive flag '${tok}'`);
			continue;
		}
		const key = tok.slice(0, eq);
		const val = tok.slice(eq + 1);
		if (key === 'id') id = val;
		else if (key === 'source') source = val;
		else if (key === 'audience') audience = val;
		else if (key === 'kind') itemKind = val;
		else throw new FormatTemplateParseError(`unknown directive attribute '${key}'`);
	}
	return { id, source, audience, required, numbered, ...(itemKind !== undefined ? { itemKind } : {}) };
}

function buildSpec(attrs: Attrs, heading: string, guidance: string): SectionSpec {
	if (attrs.id === undefined || attrs.id.length === 0) throw new FormatTemplateParseError('section directive missing id');
	const source = (attrs.source ?? 'body') as SectionSource;
	if (!SOURCES.includes(source)) throw new FormatTemplateParseError(`invalid source '${attrs.source}'`);
	if (attrs.audience !== undefined && !AUDIENCES.includes(attrs.audience as Audience)) {
		throw new FormatTemplateParseError(`invalid audience '${attrs.audience}'`);
	}
	return {
		id: attrs.id,
		heading,
		contentGuidance: guidance,
		required: attrs.required,
		numbered: attrs.numbered,
		source,
		...(attrs.audience !== undefined ? { audience: attrs.audience as Audience } : {}),
	};
}

/** Parse an editable markdown FORMAT template into a DocumentFormat. Throws a
 *  FormatTemplateParseError on a malformed file (missing header / id / heading,
 *  unknown attribute, or a kind mismatch when `expectKind` is supplied). */
export function parseFormatTemplate(text: string, expectKind?: DocumentFormat['kind']): DocumentFormat {
	const rawLines = text.split('\n');
	// Header.
	let i = 0;
	while (i < rawLines.length && rawLines[i]!.trim().length === 0) i += 1;
	const header = HEADER_RE.exec((rawLines[i] ?? '').trim());
	if (header === null) throw new FormatTemplateParseError('missing `<!-- insrc:format v1 kind=… -->` header');
	const kind = header[2] as DocumentFormat['kind'];
	if (!KINDS.includes(kind)) throw new FormatTemplateParseError(`invalid format kind '${kind}'`);
	if (expectKind !== undefined && kind !== expectKind) {
		throw new FormatTemplateParseError(`template kind '${kind}' does not match expected '${expectKind}'`);
	}
	i += 1;

	// h1 — the first `# …` line.
	let h1: string | undefined;
	for (; i < rawLines.length; i += 1) {
		const t = rawLines[i]!.trim();
		if (t.length === 0) continue;
		const m = /^#\s+(.*)$/.exec(t);
		if (m === null) throw new FormatTemplateParseError('expected an `# <h1>` line after the header');
		h1 = m[1]!.trim();
		i += 1;
		break;
	}
	if (h1 === undefined) throw new FormatTemplateParseError('missing `# <h1>` line');

	// Walk directive blocks.
	let summary: SectionSpec | undefined;
	const sections: SectionSpec[] = [];
	let itemKind: ItemFormat['itemKind'] | undefined;
	const itemSections: SectionSpec[] = [];

	while (i < rawLines.length) {
		const line = rawLines[i]!.trim();
		if (line.length === 0) { i += 1; continue; }
		const dir = DIRECTIVE_RE.exec(line);
		if (dir === null) throw new FormatTemplateParseError(`expected a directive comment, got: ${line}`);
		const role = dir[1]!;
		const attrs = parseAttrs(dir[2]!);
		i += 1;

		if (role === 'itemFormat') {
			const k = attrs.itemKind;
			if (k !== 'story' && k !== 'task') throw new FormatTemplateParseError(`itemFormat needs kind=story|task, got '${k ?? ''}'`);
			itemKind = k;
			continue;
		}

		// Heading line (next non-empty).
		while (i < rawLines.length && rawLines[i]!.trim().length === 0) i += 1;
		const headingLine = (rawLines[i] ?? '').trim();
		const hm = /^#{2,3}\s+(.*)$/.exec(headingLine);
		if (hm === null) throw new FormatTemplateParseError(`directive '${role} id=${attrs.id ?? ''}' must be followed by a ## / ### heading`);
		const heading = hm[1]!.trim();
		i += 1;

		// Guidance = lines until the next directive / EOF, trimmed.
		const guidanceLines: string[] = [];
		while (i < rawLines.length && DIRECTIVE_RE.exec(rawLines[i]!.trim()) === null) {
			guidanceLines.push(rawLines[i]!);
			i += 1;
		}
		const guidance = guidanceLines.join('\n').trim();
		const spec = buildSpec(attrs, heading, guidance);

		if (role === 'summary') {
			if (summary !== undefined) throw new FormatTemplateParseError('duplicate summary section');
			summary = spec;
		} else if (role === 'section') {
			sections.push(spec);
		} else { // item-section
			if (itemKind === undefined) throw new FormatTemplateParseError('item-section before an itemFormat directive');
			itemSections.push(spec);
		}
	}

	if (summary === undefined) throw new FormatTemplateParseError('missing summary section');
	const fmt: DocumentFormat = {
		kind,
		h1,
		summary,
		sections,
		...(itemKind !== undefined ? { itemFormat: { itemKind, sections: itemSections } } : {}),
	};
	return fmt;
}
