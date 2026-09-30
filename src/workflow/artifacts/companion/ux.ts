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
	switch (el.type) {
		case 'Container': return el.items;
		case 'Column':    return el.items;
		case 'ColumnSet': return el.columns;
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
