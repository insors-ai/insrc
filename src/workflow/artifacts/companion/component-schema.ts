/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * sc3 (S003, artifact-companion-wiring) — the JSON-schema FRAGMENT + the
 * content-gate prompt rule the design.epic / design.story synthesizer body schemas
 * admit-but-never-emit for an AUTHORED `componentDependencyDefinition` (named
 * components + directed dependency edges). The component-dependency peer of
 * er-schema.ts / ux-schema.ts / sequence-schema.ts.
 *
 * Kept in this neutral companion module (no imports back into orchestrator /
 * runners) so the synthesizer body schema single-sources the exact same
 * ComponentDependencyDefinition shape. The shape mirrors the interface in
 * ./component.ts. It is admitted only so `additionalProperties:false` does not
 * reject a body that already carries one; the LLM authors it ONLY under the
 * content-gate.
 */

/** The AUTHORED `componentDependencyDefinition` body-element schema. Optional
 *  (never required): the LLM authors it ONLY under the content-gate. */
export const COMPONENT_DEFINITION_PROPERTY_SCHEMA: Record<string, unknown> = {
	type: 'object',
	required: ['components', 'dependencies'],
	additionalProperties: false,
	properties: {
		id: { type: 'string' },
		components: {
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
		dependencies: {
			type: 'array',
			items: {
				type: 'object',
				required: ['from', 'to'],
				additionalProperties: false,
				properties: {
					from:  { type: 'string' },
					to:    { type: 'string' },
					label: { type: 'string' },
				},
			},
		},
	},
};

/** The content-gate HARD RULE the HLD + LLD synthesizers share for the component element. */
export const COMPONENT_CONTENT_GATE_RULE =
	'- CONTENT-GATE — author a `componentDependencyDefinition` (named `components` + directed `dependencies`) ONLY when a component / module dependency diagram would materially aid understanding of THIS document; omit it entirely otherwise. It is the SOURCE OF TRUTH; a component-dependency companion is generated from it deterministically. Do NOT author `companions` — the framework renders + attaches those.';
