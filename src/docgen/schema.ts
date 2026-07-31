/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * docgen — hand-mirrored MCP output JSON schema (Epic 870ed3dd, Story s1 · t8).
 *
 * The `DocGenOutcome<T>` union is generic, so its JSON schema cannot be derived
 * automatically for the MCP output surface under `exactOptionalPropertyTypes`.
 * This is the hand-written mirror for `T = RenderedDocumentShell` (the boundary
 * type). A contract test (schema.test.ts) validates one sample per TS variant
 * against it, so the two cannot silently drift.
 */

/**
 * Build the registry-derived surface input schema (s6 · t2): `{ docType }` (an
 * enum of the registered types) plus the UNION of every registration's
 * `extractorInputSchema.properties`, with `repo` (required by every type) +
 * `docType` required at the union and all per-type fields (path/symbol/base/
 * question/maxDepth) optional — a caller picks one docType, so per-type
 * requiredness is enforced downstream by that extractor's own parseScope.
 *
 * This is the SINGLE derivation point the daemon tool (tool.ts) and the MCP
 * tool (server.ts) both call, so no surface hand-maintains a doc-type list and
 * a newly-registered type appears on every surface with zero edits (k4/ac4).
 * Property keys are shared + compatible across the built-in types, so
 * first-definition-wins is a faithful union; deterministic in registration
 * order.
 */
export function buildDocgenInputSchema(
	docTypes: readonly { readonly docType: string; readonly extractorInputSchema: Record<string, unknown> }[],
): Record<string, unknown> {
	const properties: Record<string, unknown> = {
		docType: {
			type: 'string',
			enum: docTypes.map(d => d.docType),
			description: 'The document type to generate (one of the registered types)',
		},
	};
	for (const d of docTypes) {
		const props = (d.extractorInputSchema as { properties?: Record<string, unknown> }).properties ?? {};
		for (const [key, val] of Object.entries(props)) {
			if (!(key in properties)) properties[key] = val;   // shared keys are compatible; first wins
		}
	}
	return {
		type: 'object',
		additionalProperties: false,
		required: ['docType', 'repo'],
		properties,
	};
}

/** JSON schema for `RenderedDocumentShell` (sc3). */
export const RENDERED_DOCUMENT_SHELL_SCHEMA = {
	type: 'object',
	additionalProperties: false,
	required: ['docType', 'backend', 'html', 'inlinedRuntimeVersion', 'diagramFormat', 'supportsZoomPan'],
	properties: {
		docType:              { type: 'string' },
		backend:              { type: 'string', enum: ['primary-inline', 'fallback-subprocess'] },
		html:                 { type: 'string' },
		inlinedRuntimeVersion: { type: 'string' },
		diagramFormat:        { const: 'svg' },
		supportsZoomPan:      { const: true },
	},
} as const;

/** JSON schema for `DocGenOutcome<RenderedDocumentShell>` — one branch per TS
 *  variant, discriminated by `status`. */
export const DOCGEN_OUTCOME_SCHEMA = {
	oneOf: [
		{
			type: 'object', additionalProperties: false, required: ['status', 'value'],
			properties: { status: { const: 'ok' }, value: RENDERED_DOCUMENT_SHELL_SCHEMA },
		},
		{
			type: 'object', additionalProperties: false, required: ['status', 'reason'],
			properties: { status: { const: 'empty-scope' }, reason: { type: 'string' } },
		},
		{
			type: 'object', additionalProperties: false, required: ['status', 'symbol'],
			properties: { status: { const: 'not-found' }, symbol: { type: 'string' } },
		},
		{
			type: 'object', additionalProperties: false, required: ['status', 'depthUsed'],
			properties: { status: { const: 'truncated' }, depthUsed: { type: 'number' } },
		},
		{
			type: 'object', additionalProperties: false, required: ['status', 'reason', 'remedy'],
			properties: { status: { const: 'fallback-unavailable' }, reason: { type: 'string' }, remedy: { type: 'string' } },
		},
		{
			type: 'object', additionalProperties: false, required: ['status', 'reason'],
			properties: { status: { const: 'source-not-ready' }, reason: { type: 'string' } },
		},
	],
} as const;
