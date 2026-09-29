/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * sc3 (S003, artifact-companion-wiring) — the JSON-schema FRAGMENT + the
 * content-gate prompt rule the design.epic / design.story synthesizer body schemas
 * admit-but-never-emit for an AUTHORED `sequenceDefinition` (an ordered
 * participants + messages behaviour sketch). The sequence peer of er-schema.ts /
 * ux-schema.ts.
 *
 * Kept in this neutral companion module (no imports back into orchestrator /
 * runners) so the synthesizer body schema single-sources the exact same
 * SequenceDefinition shape. The shape mirrors the SequenceDefinition interface in
 * ./sequence.ts. It is admitted only so `additionalProperties:false` does not
 * reject a body that already carries one; the LLM authors it ONLY under the
 * content-gate.
 */

/** The AUTHORED `sequenceDefinition` body-element schema. Optional (never
 *  required): the LLM authors it ONLY under the content-gate. */
export const SEQUENCE_DEFINITION_PROPERTY_SCHEMA: Record<string, unknown> = {
	type: 'object',
	required: ['participants', 'messages'],
	additionalProperties: false,
	properties: {
		id: { type: 'string' },
		participants: {
			type: 'array',
			items: {
				type: 'object',
				required: ['id'],
				additionalProperties: false,
				properties: {
					id:    { type: 'string' },
					label: { type: 'string' },
				},
			},
		},
		messages: {
			type: 'array',
			items: {
				type: 'object',
				required: ['from', 'to', 'label'],
				additionalProperties: false,
				properties: {
					from:  { type: 'string' },
					to:    { type: 'string' },
					label: { type: 'string' },
					kind:  { enum: ['call', 'return', 'recurse'] },
					note:  { type: 'string' },
				},
			},
		},
		truncations: {
			type: 'array',
			items: {
				type: 'object',
				required: ['atParticipant', 'note'],
				additionalProperties: false,
				properties: {
					atParticipant: { type: 'string' },
					note:          { type: 'string' },
				},
			},
		},
	},
};

/** The content-gate HARD RULE the HLD + LLD synthesizers share for the sequence element. */
export const SEQUENCE_CONTENT_GATE_RULE =
	'- CONTENT-GATE — author a `sequenceDefinition` (ordered `participants` + `messages`) ONLY when a behaviour / call-flow diagram would materially aid understanding of THIS document; omit it entirely otherwise. It is the SOURCE OF TRUTH; a sequence-diagram companion is generated from it deterministically. Do NOT author `companions` — the framework renders + attaches those.';
