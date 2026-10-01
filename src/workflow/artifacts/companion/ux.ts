/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * sc4 (S004) — the authored UxDefinition body element + its deterministic
 * validation/visualization. The UX peer of the S003 ErDefinition set.
 *
 * The UxDefinition is an ADAPTIVE CARDS card SUBSET (the stakeholder-directed
 * source of truth): `{ type:'AdaptiveCard', version?, body: element[] }` where each
 * element is one of a small, sensible subset (TextBlock, Container, ColumnSet/
 * Column, Image, Input.Text, Input.ChoiceSet, ActionSet/Action.Submit/OpenUrl). The
 * JSON element is validated (against the vendored Adaptive Cards schema via the
 * shared ajv) and visualized (uxDefinitionToIr → docgen assembleShell); the ux-mock
 * companion is DERIVED from it, never the reverse. Validation runs against the JSON
 * element ONLY — it never reads a rendered companion file (k2).
 *
 * Deterministic + provider-free.
 */

import type { DocumentIR, IrEdge, IrNode, IrSection } from '../../../docgen/types.js';
import type { DimensionFinding } from '../../code-review/types.js';
import type { FunctionalDefinition } from '../functional-definition.js';
import { validateAgainstSchema } from '../../../agent/providers/structured-output.js';
import { loadAdaptiveCardsSchema, AdaptiveCardsAssetError } from './adaptive-cards.js';

// ---------------------------------------------------------------------------
// t1 — UxDefinition (Adaptive Cards subset) types
// ---------------------------------------------------------------------------

/** A TextBlock element — displayed text. */
export interface UxTextBlock {
	readonly type:      'TextBlock';
	readonly text:      string;
	readonly weight?:   'lighter' | 'default' | 'bolder' | undefined;
	readonly size?:     'small' | 'default' | 'medium' | 'large' | 'extraLarge' | undefined;
	readonly color?:    'default' | 'dark' | 'light' | 'accent' | 'good' | 'warning' | 'attention' | undefined;
	readonly wrap?:     boolean | undefined;
	readonly isSubtle?: boolean | undefined;
}

/** A Container element — a vertical group of child elements. */
export interface UxContainer {
	readonly type:  'Container';
	readonly items: readonly UxElement[];
}

/** A ColumnSet element — a horizontal row of Columns. */
export interface UxColumnSet {
	readonly type:    'ColumnSet';
	readonly columns: readonly UxColumn[];
}

/** A Column element — a vertical group inside a ColumnSet. */
export interface UxColumn {
	readonly type:   'Column';
	readonly items:  readonly UxElement[];
	readonly width?: string | number | undefined;
}

/** An Image element. */
export interface UxImage {
	readonly type:     'Image';
	readonly url:      string;
	readonly altText?: string | undefined;
	readonly size?:    'auto' | 'stretch' | 'small' | 'medium' | 'large' | undefined;
}

/** A single-line/multi-line text input. */
export interface UxInputText {
	readonly type:         'Input.Text';
	readonly id:           string;
	readonly label?:       string | undefined;
	readonly placeholder?: string | undefined;
	readonly isMultiline?: boolean | undefined;
}

/** One choice of an Input.ChoiceSet. */
export interface UxChoice {
	readonly title: string;
	readonly value: string;
}

/** A choice-set input (dropdown / radio / multiselect). */
export interface UxInputChoiceSet {
	readonly type:           'Input.ChoiceSet';
	readonly id:             string;
	readonly label?:         string | undefined;
	readonly isMultiSelect?: boolean | undefined;
	readonly choices:        readonly UxChoice[];
}

/** A submit or open-url action. */
export interface UxAction {
	readonly type:  'Action.Submit' | 'Action.OpenUrl';
	readonly title: string;
	readonly url?:  string | undefined;
}

/** An action set — a row of actions. */
export interface UxActionSet {
	readonly type:    'ActionSet';
	readonly actions: readonly UxAction[];
}

/** One card element — the discriminated union of the supported element types. */
export type UxElement =
	| UxTextBlock
	| UxContainer
	| UxColumnSet
	| UxColumn
	| UxImage
	| UxInputText
	| UxInputChoiceSet
	| UxActionSet;

/** The authored UX design — the source of truth for the UX mock companion. */
export interface UxDefinition {
	readonly type:     'AdaptiveCard';
	readonly version?: string | undefined;
	readonly body:     readonly UxElement[];
}

/** Thrown when the vendored Adaptive Cards schema asset is unloadable/malformed — a
 *  boot-time / load fault, not authored content (mirrors ErDefinitionError). */
export class UxDefinitionError extends Error {
	constructor(message: string) {
		super(message);
		this.name = 'UxDefinitionError';
	}
}

// ---------------------------------------------------------------------------
// t1 — validateUxDefinition (JSON element only; never the rendered doc)
// ---------------------------------------------------------------------------

const DIMENSION = 'ux' as const;

/**
 * Validate the authored UxDefinition JSON element against the vendored Adaptive
 * Cards schema (via the shared ajv validateAgainstSchema), operating on the JSON
 * element ONLY (never the rendered file). Returns an EMPTY array when sound; a
 * schema violation is a HIGH 'breach' finding that folds to `block` through the
 * un-forked verdict/enforce gate (ac2/k4).
 *
 * @throws UxDefinitionError when the vendored Adaptive Cards schema asset is
 *   unloadable/malformed (a boot-time/load fault, not authored content).
 */
export function validateUxDefinition(uxDef: unknown, _fnDef?: FunctionalDefinition): readonly DimensionFinding[] {
	let schema;
	try {
		schema = loadAdaptiveCardsSchema();
	} catch (err) {
		if (err instanceof AdaptiveCardsAssetError) throw err;
		throw new UxDefinitionError(`Adaptive Cards schema asset unavailable: ${(err as Error).message}`);
	}
	const validated = validateAgainstSchema<UxDefinition>(schema, uxDef);
	if (!validated.ok) {
		return validated.errors.map(e => breach('uxDefinition', `Adaptive Cards violation: ${e}`));
	}
	return [];
}

/** A HIGH 'breach' ux finding. */
function breach(location: string, message: string): DimensionFinding {
	return { dimension: DIMENSION, severity: 'HIGH', location, message, confidence: 'breach' };
}

// ---------------------------------------------------------------------------
// t1 — uxDefinitionToIr (deterministic; feeds docgen assembleShell)
// ---------------------------------------------------------------------------

/** The docType stamped on the UX IR. Not a registered extractor docType — it is
 *  consumed only by assembleShell's mermaid emitter, which renders any non
 *  call-sequence / component-dependency docType as a classDiagram. */
export const UX_DOC_TYPE = 'ux';

/** The nested child elements of a container-like element (Container/Column items,
 *  ColumnSet columns); a leaf element yields []. */
function childrenOf(el: UxElement): readonly UxElement[] {
	// The child list is read DEFENSIVELY rather than trusted. The types forbid a
	// missing or non-array `items`, but a companion renders from a STORED artifact
	// body, which can predate a schema change or be hand-edited past the type. An
	// unguarded read here threw a TypeError that took out the whole document —
	// including the narrated prose, which walks the same tree — so a malformed
	// sub-tree now degrades to an empty region instead.
	const list = (v: unknown): readonly UxElement[] => (Array.isArray(v) ? v as readonly UxElement[] : []);
	switch (el.type) {
		case 'Container': return list(el.items);
		case 'Column':    return list(el.items);
		case 'ColumnSet': return list(el.columns);
		default:          return [];
	}
}

/** A deterministic, human-readable label for a card element node. */
function labelFor(el: UxElement): string {
	switch (el.type) {
		case 'TextBlock':       return `TextBlock: "${truncate(el.text)}"`;
		case 'Image':           return `Image: ${el.url}`;
		case 'Input.Text':      return `Input.Text #${el.id}`;
		case 'Input.ChoiceSet': return `Input.ChoiceSet #${el.id} (${el.choices.map(c => c.title).join(', ')})`;
		case 'ActionSet':       return `ActionSet (${el.actions.map(a => a.title).join(', ')})`;
		case 'Container':       return 'Container';
		case 'ColumnSet':       return 'ColumnSet';
		case 'Column':          return el.width !== undefined ? `Column (${el.width})` : 'Column';
	}
}

/** Truncate long text for a node label (deterministic). */
function truncate(s: string): string {
	return s.length > 40 ? `${s.slice(0, 37)}...` : s;
}

/** A one-line role description for each supported element type (for the Legend
 *  and the Elements section). */
function roleOf(type: UxElement['type']): string {
	switch (type) {
		case 'TextBlock':       return 'read-only display text';
		case 'Image':           return 'an image';
		case 'Input.Text':      return 'a text input the user fills in';
		case 'Input.ChoiceSet': return 'a choice/dropdown input';
		case 'ActionSet':       return 'a row of buttons (submit / open-url actions)';
		case 'Container':       return 'a vertical grouping of elements';
		case 'ColumnSet':       return 'a horizontal row of columns';
		case 'Column':          return 'a vertical group inside a column set';
	}
}

/**
 * Derive the reader-facing narrated sections for a UX-mock companion (S001):
 * a Purpose section, an Elements & roles section (each card element in document
 * order, indented by nesting, with its type + a readable label + role), and a
 * Legend of the element types used. Read-only over the same walk the diagram
 * uses. For an empty-but-valid card the elements section is omitted (Purpose +
 * Legend only). The band renderer escapes all this text.
 */
function uxNarratedSections(uxDef: UxDefinition): IrSection[] {
	const rows: string[] = [];
	const kinds = new Set<UxElement['type']>();
	const walk = (elements: readonly UxElement[], depth: number): void => {
		for (const el of elements) {
			kinds.add(el.type);
			rows.push(`${'  '.repeat(depth + 1)}• ${labelFor(el)} — ${roleOf(el.type)}`);
			const children = childrenOf(el);
			if (children.length > 0) walk(children, depth + 1);
		}
	};
	walk(uxDef.body, 0);

	const sections: IrSection[] = [{
		id:    'purpose',
		title: 'Purpose',
		narrativeText:
			`This is the intended layout of an Adaptive Card${uxDef.version !== undefined && uxDef.version.length > 0 ? ` (v${uxDef.version})` : ''}. ` +
			`It lists every element the user sees and each interactive control, so a reader understands what the card ` +
			`asks for and what each control does without reading the card JSON.`,
	}];

	if (rows.length > 0) {
		sections.push({ id: 'fields', title: 'Elements & roles', narrativeText: rows.join('\n') });
	}

	const legendLines = [...kinds].map(k => `${k} — ${roleOf(k)}.`);
	sections.push({
		id:    'legend',
		title: 'Legend',
		narrativeText: legendLines.length > 0
			? legendLines.join('\n')
			: `TextBlock — read-only display text.\nInput.* — an interactive field.\nActionSet — a row of action buttons.`,
	});
	return sections;
}

/**
 * Transform a UxDefinition into a docgen DocumentIR: the card is the root node,
 * every element is a node, and containment (a container-like element → each child)
 * is an IrEdge. Pure + deterministic: array order is preserved, so the same uxDef
 * always yields byte-identical IR (no graph, no provider).
 */
export function uxDefinitionToIr(uxDef: UxDefinition): DocumentIR {
	const nodes: IrNode[] = [];
	const edges: IrEdge[] = [];
	const rootId = 'AdaptiveCard';
	nodes.push({
		id:    rootId,
		label: uxDef.version !== undefined && uxDef.version.length > 0 ? `AdaptiveCard (v${uxDef.version})` : 'AdaptiveCard',
		kind:  'card',
	});

	const walk = (elements: readonly UxElement[], parentId: string, prefix: string): void => {
		elements.forEach((el, i) => {
			const id = `${prefix}${i}`;
			nodes.push({ id, label: labelFor(el), kind: el.type });
			edges.push({ id: `${parentId}->${id}`, from: parentId, to: id, kind: 'contains' });
			const children = childrenOf(el);
			if (children.length > 0) walk(children, id, `${id}.`);
		});
	};
	walk(uxDef.body, rootId, 'el');

	return {
		docType:             UX_DOC_TYPE,
		scopeDescription:    'UX mock',
		derived:             { nodes, edges },
		narrated:            { sections: uxNarratedSections(uxDef) },
		generatedAtRevision: 'authored-ux',
	};
}

// ---------------------------------------------------------------------------
// S001/t1 (ISSUE-85e6a58693579b6d) — the UX mock LAYOUT emitter.
//
// `uxDefinitionToIr` above lowers a card into a node/edge graph, which the
// shared docgen shell draws as a mermaid diagram. That is the right shape for
// the ER / sequence / component companions and the WRONG shape for this one: a
// reviewer opening an "experience mock" was shown boxes labelled with element
// TYPE NAMES rather than anything resembling the interface.
//
// This emitter is the terminal renderer for the UX companion instead. A card is
// structurally a nested box layout, so it lowers to nested markup directly: each
// element becomes the thing it DENOTES — text as text, an input as a labelled
// control, an action set as a row of buttons, a column set as side-by-side
// columns. Build-time and pure: whatever this function produced is exactly what
// the reader sees, with no script between the two that could swallow it.
// ---------------------------------------------------------------------------

/** Escape authored content for embedding as HTML text or an attribute value.
 *  Authored card content is DATA, never markup — a card must not be able to
 *  inject structure into its own mock. */
function esc(v: string): string {
	return v
		.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
		.replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

/** The container child list, guarded. `childrenOf` trusts the type assertion;
 *  a STORED card body can carry a malformed `items`, so the read is defensive
 *  here — a bad sub-tree degrades to an empty region, never to a crash. */
function safeChildren(el: UxElement): readonly UxElement[] {
	try {
		const kids = childrenOf(el);
		return Array.isArray(kids) ? kids : [];
	} catch { return []; }
}

/** One element → the markup that denotes it. EXHAUSTIVE over UxElement: the
 *  union is closed at eight variants, so a ninth fails the build here first. */
function elementHtml(el: UxElement): string {
	switch (el.type) {
		case 'TextBlock': {
			const cls = ['ux-text'];
			if (el.weight === 'bolder')  cls.push('ux-bolder');
			if (el.weight === 'lighter') cls.push('ux-lighter');
			if (el.isSubtle === true)    cls.push('ux-subtle');
			if (el.size !== undefined)   cls.push(`ux-size-${el.size}`);
			if (el.color !== undefined)  cls.push(`ux-color-${el.color}`);
			return `<p class="${cls.join(' ')}">${esc(el.text)}</p>`;
		}
		case 'Container':
			return `<div class="ux-container">${childListHtml(el)}</div>`;
		case 'ColumnSet':
			return `<div class="ux-columnset">${safeChildren(el).map(elementHtml).join('')}</div>`;
		case 'Column': {
			const w = el.width !== undefined ? ` style="flex:${/^\d+$/.test(String(el.width)) ? String(el.width) : '1'} 1 0"` : '';
			return `<div class="ux-column"${w}>${childListHtml(el)}</div>`;
		}
		case 'Image':
			// A placeholder: the url is SHOWN, never fetched. This is the one element
			// where a renderer would naturally reach out, and the no-network invariant
			// is at its sharpest here.
			return `<div class="ux-image" role="img" aria-label="${esc(el.altText ?? 'image')}">`
				+ `<span class="ux-image__icon" aria-hidden="true">▣</span>`
				+ `<span class="ux-image__meta"><span class="ux-image__alt">${esc(el.altText ?? 'image')}</span>`
				+ `<span class="ux-image__url">${esc(el.url)}</span></span></div>`;
		case 'Input.Text':
			return `<label class="ux-field"><span class="ux-label">${esc(el.label ?? el.id)}</span>`
				+ (el.isMultiline === true
					? `<span class="ux-input ux-input--multi">${esc(el.placeholder ?? '')}</span>`
					: `<span class="ux-input">${esc(el.placeholder ?? '')}</span>`)
				+ `</label>`;
		case 'Input.ChoiceSet':
			return `<div class="ux-field"><span class="ux-label">${esc(el.label ?? el.id)}</span>`
				+ `<div class="ux-choices">`
				+ el.choices.map(c =>
					`<span class="ux-choice"><span class="ux-choice__mark" aria-hidden="true">`
					+ `${el.isMultiSelect === true ? '☐' : '○'}</span>${esc(c.title)}</span>`).join('')
				+ `</div></div>`;
		case 'ActionSet':
			// Submit and OpenUrl must be TELLABLE APART — a reviewer needs to know
			// which control commits and which navigates. The old node label joined
			// only the titles, so both collapsed into one indistinguishable string.
			return `<div class="ux-actions">`
				+ el.actions.map(a => a.type === 'Action.OpenUrl'
					? `<span class="ux-btn ux-btn--link" title="${esc(a.url ?? '')}">${esc(a.title)}<span class="ux-btn__glyph" aria-hidden="true"> ↗</span></span>`
					: `<span class="ux-btn ux-btn--submit">${esc(a.title)}</span>`).join('')
				+ `</div>`;
		default: {
			// EXHAUSTIVENESS, enforced HERE rather than borrowed. Assigning `el` to
			// `never` compiles only while every variant above is handled, so adding a
			// ninth to the union fails the build in THIS function. Without it the
			// bare `default` would silently absorb a new variant — and the build
			// would still break, but only incidentally, via labelFor/roleOf on the
			// now-dead IR path, which is precisely the code most likely to be deleted.
			const unhandled: never = el;
			void unhandled;
			// At RUNTIME the arm is still reachable, because a stored card body can
			// predate a schema change or be hand-edited past the type. Such an element
			// DEGRADES VISIBLY rather than vanishing: a reviewer must never approve a
			// design with an invisible hole in it.
			return `<div class="ux-unknown">unrenderable element: `
				+ `${esc(String((el as { type?: unknown }).type ?? 'unknown'))}</div>`;
		}
	}
}

/** The children of a container element, or an empty string. */
function childListHtml(el: UxElement): string {
	return safeChildren(el).map(elementHtml).join('');
}

/** Inline stylesheet. Self-contained by construction: no @import, no font fetch,
 *  no remote anything. Geometry is what makes the mock read as an interface. */
const UX_MOCK_STYLE = [
	`*{box-sizing:border-box}`,
	`body{margin:0;padding:24px;background:#eef1f5;color:#1b1f24;`,
	`font:14px/1.55 -apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif}`,
	`.ux-wrap{max-width:720px;margin:0 auto}`,
	`.ux-title{font-size:13px;font-weight:600;letter-spacing:.06em;text-transform:uppercase;`,
	`color:#5b6673;margin:0 0 10px}`,
	`.ux-card{background:#fff;border:1px solid #d6dbe1;border-radius:8px;padding:18px;`,
	`box-shadow:0 1px 3px rgba(16,22,26,.08)}`,
	`.ux-card>*+*{margin-top:10px}`,
	`.ux-text{margin:0;overflow-wrap:anywhere}`,
	`.ux-bolder{font-weight:700}.ux-lighter{font-weight:300}.ux-subtle{color:#6b7684}`,
	`.ux-size-small{font-size:12px}.ux-size-medium{font-size:17px}`,
	`.ux-size-large{font-size:21px}.ux-size-extraLarge{font-size:26px}`,
	`.ux-color-accent{color:#1f6feb}.ux-color-good{color:#1a7f37}`,
	`.ux-color-warning{color:#9a6700}.ux-color-attention{color:#cf222e}`,
	`.ux-container{border:1px solid #e4e8ec;border-radius:6px;padding:12px;background:#fafbfc}`,
	`.ux-container>*+*{margin-top:10px}`,
	`.ux-columnset{display:flex;gap:12px;align-items:flex-start}`,
	`.ux-column{flex:1 1 0;min-width:0}.ux-column>*+*{margin-top:10px}`,
	`.ux-columnset:empty,.ux-container:empty{min-height:28px}`,
	`.ux-image{display:flex;gap:10px;align-items:center;border:1px dashed #c4ccd4;`,
	`border-radius:6px;padding:10px;background:#f4f6f8;color:#5b6673}`,
	`.ux-image__icon{font-size:20px;line-height:1}`,
	`.ux-image__meta{display:flex;flex-direction:column;min-width:0}`,
	`.ux-image__alt{font-size:13px}`,
	`.ux-image__url{font-size:11px;color:#8b95a1;overflow-wrap:anywhere}`,
	`.ux-field{display:block}`,
	`.ux-label{display:block;font-size:12px;font-weight:600;color:#44505e;margin-bottom:4px}`,
	`.ux-input{display:block;border:1px solid #c4ccd4;border-radius:5px;padding:7px 10px;`,
	`background:#fff;color:#8b95a1;font-size:13px;min-height:34px;overflow-wrap:anywhere}`,
	`.ux-input--multi{min-height:68px}`,
	`.ux-choices{display:flex;flex-wrap:wrap;gap:14px}`,
	`.ux-choice{display:inline-flex;align-items:center;gap:6px;font-size:13px}`,
	`.ux-choice__mark{color:#8b95a1}`,
	`.ux-actions{display:flex;flex-wrap:wrap;gap:8px;padding-top:2px}`,
	`.ux-btn{display:inline-flex;align-items:center;border-radius:5px;padding:7px 14px;`,
	`font-size:13px;font-weight:600}`,
	`.ux-btn--submit{background:#1f6feb;color:#fff}`,
	`.ux-btn--link{background:#fff;color:#1f6feb;border:1px solid #9dc1f5}`,
	`.ux-btn__glyph{font-weight:400}`,
	`.ux-unknown{border:1px dashed #cf222e;border-radius:6px;padding:10px;`,
	`background:#fff5f5;color:#cf222e;font-size:12px}`,
	`.ux-notes{margin-top:22px;border-top:1px solid #d6dbe1;padding-top:16px}`,
	`.ux-note h2{font-size:13px;margin:0 0 6px;color:#1b1f24}`,
	`.ux-note p{margin:0 0 12px;color:#44505e;white-space:pre-wrap;overflow-wrap:anywhere}`,
	`.ux-source{font-size:12px;margin-bottom:14px}.ux-source a{color:#1f6feb}`,
].join('');

/**
 * Render a UxDefinition as a self-contained offline HTML document showing the
 * card as an INTERFACE. The narrated prose sections are emitted BESIDE the mock
 * rather than instead of it — they carry authorial intent a mock alone cannot.
 *
 * Pure: no IO, no subprocess, no runtime load, so the same definition always
 * yields a byte-identical string.
 */
export function renderUxMockDocument(
	uxDef: UxDefinition,
	title: string,
	opts: { sourceLink?: { label: string; href: string } | undefined } = {},
): string {
	const body = Array.isArray(uxDef.body) ? uxDef.body : [];
	const cardHtml = body.map(elementHtml).join('');
	const notes = uxNarratedSections(uxDef)
		.map(s => `<section class="ux-note"><h2>${esc(s.title)}</h2><p>${esc(s.narrativeText)}</p></section>`)
		.join('');
	const link = opts.sourceLink !== undefined
		? `<p class="ux-source"><a href="${esc(opts.sourceLink.href)}">${esc(opts.sourceLink.label)}</a></p>`
		: '';
	return `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8">`
		+ `<meta name="viewport" content="width=device-width,initial-scale=1">`
		+ `<title>${esc(title)}</title><style>${UX_MOCK_STYLE}</style></head><body>`
		+ `<div class="ux-wrap">`
		+ `<p class="ux-title">${esc(title)}</p>`
		+ `<div class="ux-card">${cardHtml}</div>`
		+ `<div class="ux-notes">${link}${notes}</div>`
		+ `</div></body></html>`;
}
