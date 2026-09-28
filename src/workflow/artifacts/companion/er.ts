/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * sc4 (S003) — the authored ErDefinition body element + its deterministic
 * validation/visualization.
 *
 * The ErDefinition is a LinkML-metamodel-shaped SUBSET (the stakeholder-directed
 * source of truth): `classes` (entities) whose slots are SlotDefinitions with
 * LinkML cardinality (required/multivalued/minimum_cardinality/maximum_cardinality)
 * and a `range` (a scalar type → attribute; another class → relationship). The
 * JSON element is validated (against the vendored metamodel via ajv) and
 * visualized (erDefinitionToIr → docgen assembleShell); the companion is DERIVED
 * from it, never the reverse. Validation runs against the JSON element ONLY — it
 * never reads a rendered companion file (stakeholder direction; k2).
 *
 * This module is deterministic + provider-free: the content-gate (assess.ts) is
 * the only added provider call in the S003 pipeline.
 */

import type { DocumentIR, IrEdge, IrNode } from '../../../docgen/types.js';
import type { DimensionFinding } from '../../code-review/types.js';
import type { FunctionalDefinition } from '../functional-definition.js';
import { validateAgainstSchema } from '../../../agent/providers/structured-output.js';
import { loadLinkmlMetamodelSchema } from './metamodel.js';

// ---------------------------------------------------------------------------
// t1 — ErDefinition (LinkML subset) types
// ---------------------------------------------------------------------------

/** One slot of an ER class — a LinkML SlotDefinition subset. */
export interface ErSlot {
	/** The slot type: a scalar type name (attribute) or a class name (relationship). */
	readonly range?:               string | undefined;
	readonly required?:            boolean | undefined;
	readonly multivalued?:         boolean | undefined;
	readonly minimum_cardinality?: number | undefined;
	readonly maximum_cardinality?: number | undefined;
	/** LinkML `identifier`: this slot uniquely identifies an instance. */
	readonly identifier?:          boolean | undefined;
}

/** One ER class (entity) — a LinkML ClassDefinition subset. */
export interface ErClass {
	readonly attributes?: Record<string, ErSlot> | undefined;
}

/** The authored ER data model — the source of truth for the ER companion. */
export interface ErDefinition {
	readonly id?:      string | undefined;
	readonly classes:  Record<string, ErClass>;
}

/** Thrown by erDefinitionToIr when a class-ranged slot names a class absent from
 *  `classes` (referential integrity) — defense-in-depth after validateErDefinition. */
export class ErDefinitionError extends Error {
	constructor(message: string) {
		super(message);
		this.name = 'ErDefinitionError';
	}
}

/** The LinkML built-in scalar types a slot `range` may name to be an ATTRIBUTE.
 *  A range that is neither one of these nor a defined class is a dangling
 *  relationship reference (a referential-integrity breach). */
const LINKML_SCALAR_TYPES: ReadonlySet<string> = new Set<string>([
	'string', 'integer', 'boolean', 'float', 'double', 'decimal',
	'time', 'date', 'datetime', 'date_or_datetime',
	'uri', 'uriorcurie', 'curie', 'ncname', 'objectidentifier', 'nodeidentifier',
	'jsonpointer', 'jsonpath', 'sparqlpath',
]);

// ---------------------------------------------------------------------------
// t4 — validateErDefinition (JSON element only; never the rendered doc)
// ---------------------------------------------------------------------------

const DIMENSION = 'diagram' as const;

/** A structural view of a validated ErDefinition for the referential/FR passes. */
interface ErView {
	readonly classes: Record<string, ErClass>;
}

/**
 * Validate the authored ErDefinition JSON element. Three layers, all deterministic
 * and provider-free, operating on the JSON element ONLY (never the rendered file):
 *
 *   1. LinkML-metamodel schema validity via ajv against the vendored metamodel.
 *   2. Referential integrity: every class-ranged slot's range resolves to a
 *      defined class; a range that is neither a known scalar nor a defined class
 *      is a dangling relationship reference (HIGH breach). Missing identifiers are
 *      surfaced as a soft LOW observation.
 *   3. FR/data-model consistency (only when `fnDef` supplied): the entities should
 *      relate to the declared functional requirements.
 *
 * Returns an EMPTY array when sound. A schema/referential violation is a HIGH
 * 'breach' finding that folds to `block` through the un-forked verdict/enforce
 * gate (ac3/k4).
 */
export function validateErDefinition(erDef: unknown, fnDef?: FunctionalDefinition): readonly DimensionFinding[] {
	const findings: DimensionFinding[] = [];

	// (1) LinkML metamodel schema validity.
	let schema;
	try {
		schema = loadLinkmlMetamodelSchema();
	} catch (err) {
		return [breach('erDefinition', `LinkML metamodel schema asset unavailable: ${(err as Error).message}`)];
	}
	const validated = validateAgainstSchema<ErView>(schema, erDef);
	if (!validated.ok) {
		for (const e of validated.errors) findings.push(breach('erDefinition', `LinkML metamodel violation: ${e}`));
		// A schema-invalid element cannot be safely walked for referential integrity.
		return findings;
	}
	const view = validated.value;

	// (2) Referential integrity + identifiers.
	const classNames = new Set(Object.keys(view.classes));
	for (const [className, cls] of Object.entries(view.classes)) {
		const attrs = cls.attributes ?? {};
		let hasIdentifier = false;
		for (const [slotName, slot] of Object.entries(attrs)) {
			if (slot.identifier === true) hasIdentifier = true;
			const range = slot.range;
			if (range === undefined || range.length === 0) continue;          // untyped slot — nothing to resolve
			if (classNames.has(range)) continue;                              // relationship → resolves
			if (LINKML_SCALAR_TYPES.has(range)) continue;                     // scalar → attribute
			findings.push(breach(
				`erDefinition:classes.${className}.attributes.${slotName}`,
				`slot '${slotName}' on class '${className}' has range '${range}', which is neither a LinkML scalar type nor a defined class (dangling relationship reference)`,
			));
		}
		if (!hasIdentifier) {
			findings.push(observation(
				`erDefinition:classes.${className}`,
				`class '${className}' declares no identifier slot (identifier:true) — the entity has no primary key`,
			));
		}
	}

	// (3) FR/data-model consistency — only when a FunctionalDefinition is supplied.
	if (fnDef !== undefined && fnDef.requirements.length > 0 && classNames.size > 0) {
		const frText = fnDef.requirements.map(r => `${r.statement} ${r.rationale ?? ''}`).join(' ').toLowerCase();
		const anyClassMentioned = [...classNames].some(name => mentions(frText, name));
		if (!anyClassMentioned) {
			findings.push({
				dimension: DIMENSION,
				severity:  'MED',
				location:  'erDefinition:classes',
				message:   `none of the ER entities (${[...classNames].join(', ')}) is referenced by any functional requirement — the data model and the FRs appear inconsistent`,
				confidence: 'observation',
			});
		}
	}

	return findings;
}

/** Whether `haystack` (lowercased) mentions `name` as a whole word (case-insensitive). */
function mentions(haystackLower: string, name: string): boolean {
	const n = name.toLowerCase();
	const i = haystackLower.indexOf(n);
	if (i < 0) return false;
	const before = i === 0 ? '' : haystackLower[i - 1]!;
	const after  = i + n.length >= haystackLower.length ? '' : haystackLower[i + n.length]!;
	const isWordChar = (c: string): boolean => /[a-z0-9]/.test(c);
	return !isWordChar(before) && !isWordChar(after);
}

/** A HIGH 'breach' diagram finding. */
function breach(location: string, message: string): DimensionFinding {
	return { dimension: DIMENSION, severity: 'HIGH', location, message, confidence: 'breach' };
}

/** A LOW 'observation' diagram finding (never blocks/warns). */
function observation(location: string, message: string): DimensionFinding {
	return { dimension: DIMENSION, severity: 'LOW', location, message, confidence: 'observation' };
}

// ---------------------------------------------------------------------------
// t5 — erDefinitionToIr (deterministic; feeds docgen assembleShell)
// ---------------------------------------------------------------------------

/** The docType stamped on the ER IR. Not a registered extractor docType — it is
 *  consumed only by assembleShell's mermaid emitter, which renders any non
 *  call-sequence / component-dependency docType as a classDiagram. */
export const ER_DOC_TYPE = 'er';

/** Compute a deterministic crow's-foot cardinality token for a relationship slot
 *  from its LinkML cardinality. `lower` is 'one' when the slot is required
 *  (min >= 1), else 'zero'; `upper` is 'many' when multivalued / max > 1, else 'one'. */
export function crowsFootToken(slot: ErSlot): string {
	const min = slot.minimum_cardinality ?? (slot.required === true ? 1 : 0);
	const maxRaw = slot.maximum_cardinality ?? (slot.multivalued === true ? Number.POSITIVE_INFINITY : 1);
	const lower = min >= 1 ? 'one' : 'zero';
	const upper = maxRaw === Number.POSITIVE_INFINITY || maxRaw > 1 ? 'many' : 'one';
	return `${lower}-to-${upper}`;
}

/**
 * Transform an ErDefinition into a docgen DocumentIR: each class → an entity
 * IrNode (its scalar-range slots folded into the label as attributes), each
 * class-ranged slot → a relationship IrEdge whose id encodes the crow's-foot
 * cardinality. Pure + deterministic: class + slot iteration is sorted, so the same
 * erDef always yields byte-identical IR (no graph, no provider).
 *
 * @throws ErDefinitionError when a class-ranged slot names a class absent from
 *   `classes` (referential integrity — should have been caught by
 *   validateErDefinition; enforced here as defense-in-depth).
 */
export function erDefinitionToIr(erDef: ErDefinition): DocumentIR {
	const classNames = new Set(Object.keys(erDef.classes));
	const nodes: IrNode[] = [];
	const edges: IrEdge[] = [];

	for (const className of [...classNames].sort()) {
		const cls = erDef.classes[className] ?? {};
		const attrs = cls.attributes ?? {};
		const attributeNames: string[] = [];
		const relationSlots: { readonly slotName: string; readonly range: string; readonly slot: ErSlot }[] = [];

		for (const slotName of Object.keys(attrs).sort()) {
			const slot = attrs[slotName]!;
			const range = slot.range;
			if (range !== undefined && range.length > 0 && classNames.has(range)) {
				relationSlots.push({ slotName, range, slot });
				continue;
			}
			if (range !== undefined && range.length > 0 && !LINKML_SCALAR_TYPES.has(range)) {
				// Not a scalar and not a defined class → a dangling relationship reference.
				throw new ErDefinitionError(
					`erDefinitionToIr: slot '${slotName}' on class '${className}' has range '${range}', ` +
					`which names no defined class and no known scalar type`,
				);
			}
			attributeNames.push(range !== undefined && range.length > 0 ? `${slotName}: ${range}` : slotName);
		}

		nodes.push({
			id:    className,
			label: attributeNames.length > 0 ? `${className} (${attributeNames.join(', ')})` : className,
			kind:  'entity',
		});

		for (const { slotName, range, slot } of relationSlots) {
			edges.push({
				id:   `${className}.${slotName}->${range}:${crowsFootToken(slot)}`,
				from: className,
				to:   range,
				kind: 'relation',
			});
		}
	}

	return {
		docType:             ER_DOC_TYPE,
		scopeDescription:    erDef.id !== undefined && erDef.id.length > 0 ? `ER model: ${erDef.id}` : 'ER model',
		derived:             { nodes, edges },
		narrated:            { sections: [] },
		generatedAtRevision: 'authored-er',
	};
}
