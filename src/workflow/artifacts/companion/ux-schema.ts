/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * sc4 (S004) — the JSON-schema FRAGMENT + the content-gate prompt rule the
 * design.epic / design.story synthesizer body schemas admit-but-never-emit for an
 * AUTHORED `uxDefinition` (an Adaptive Cards card subset). The UX peer of
 * er-schema.ts.
 *
 * Kept in this neutral companion module (no imports back into orchestrator /
 * runners) so the synthesizer body schema single-sources the exact same
 * UxDefinition shape. The shape mirrors the UxDefinition interface in ./ux.ts and
 * the vendored adaptive-cards.schema.json. The `body.items` are kept LOOSE here
 * (the full element vocabulary lives in the vendored asset, which the deterministic
 * validator uses) since the synthesizer never emits this field — it is admitted
 * only so `additionalProperties:false` does not reject a body that already carries
 * one.
 */

/** The AUTHORED `uxDefinition` body-element schema (Adaptive Cards subset). Optional
 *  (never required): the LLM authors it ONLY under the content-gate. */
export const UX_DEFINITION_PROPERTY_SCHEMA: Record<string, unknown> = {
	type: 'object',
	required: ['type', 'body'],
	additionalProperties: false,
	properties: {
		type:    { const: 'AdaptiveCard' },
		version: { type: 'string' },
		body: {
			type: 'array',
			items: { type: 'object' },
		},
	},
};

/** The content-gate HARD RULE the HLD + LLD synthesizers share for the UX element. */
export const UX_CONTENT_GATE_RULE =
	'- CONTENT-GATE — author a `uxDefinition` (an Adaptive Cards card subset) ONLY when THIS document designs a user-facing experience whose intended layout would materially aid understanding; omit it entirely otherwise. It is the SOURCE OF TRUTH; a UX mock companion is generated from it deterministically. Do NOT author `companions` — the framework renders + attaches those.';
