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
