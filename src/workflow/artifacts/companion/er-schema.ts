/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * sc4 (S003) — the JSON-schema FRAGMENTS + the content-gate prompt rule the
 * design.epic / design.story synthesizers and their `framework.write` /
 * `contract.detail` step runners share to elicit an AUTHORED `erDefinition`.
 *
 * Kept in this neutral companion module (no imports back into orchestrator /
 * runners) so the synthesizer body schema and the step schemas single-source the
 * exact same ErDefinition/ErClass/ErSlot shape — they can never drift. The shape
 * mirrors the ErDefinition/ErClass/ErSlot interfaces in ./er.ts.
 */

/** The AUTHORED `erDefinition` body-element schema (LinkML subset). Optional
 *  (never required): the LLM authors it ONLY under the content-gate. */
export const ER_DEFINITION_PROPERTY_SCHEMA: Record<string, unknown> = {
	type: 'object',
	required: ['classes'],
	additionalProperties: false,
	properties: {
		id: { type: 'string' },
		classes: {
			type: 'object',
			additionalProperties: {
				type: 'object',
				additionalProperties: false,
				properties: {
					attributes: {
						type: 'object',
						additionalProperties: {
							type: 'object',
							additionalProperties: false,
							properties: {
								range:               { type: 'string' },
								required:            { type: 'boolean' },
								multivalued:         { type: 'boolean' },
								minimum_cardinality: { type: 'integer' },
								maximum_cardinality: { type: 'integer' },
								identifier:          { type: 'boolean' },
							},
						},
					},
				},
			},
		},
	},
};

/** The `companions` body-element schema. The synthesizer NEVER authors companions
 *  (the framework renders + attaches them in finalize); present only so
 *  `additionalProperties:false` does not reject a body that already carries one. */
export const COMPANIONS_PROPERTY_SCHEMA: Record<string, unknown> = {
	type: 'array',
	items: {
		type: 'object',
		required: ['kind', 'relPath', 'title'],
		additionalProperties: false,
		properties: {
			kind:        { enum: ['diagram-mermaid', 'diagram-html', 'ux-mock'] },
			relPath:     { type: 'string' },
			title:       { type: 'string' },
			ofSectionId: { type: 'string' },
		},
	},
};

/** The content-gate HARD RULE the HLD + LLD synthesizers and their s4 steps share. */
export const ER_CONTENT_GATE_RULE =
	'- CONTENT-GATE — author an `erDefinition` (LinkML `classes`/slots) ONLY when a data model / entity-relationship visual would materially aid understanding of THIS document; omit it entirely otherwise. It is the SOURCE OF TRUTH; a companion diagram is generated from it deterministically. Do NOT author `companions` — the framework renders + attaches those.';
