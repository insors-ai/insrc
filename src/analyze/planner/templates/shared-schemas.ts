/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Shared JSON Schema fragments every template's inputSchema can
 * compose against. Pinned here so per-template modules don't
 * accidentally diverge on the ScopeRef shape.
 */

/** ScopeRef shape (matches AnalyzeScopeRef from shared/analyze-types.ts). */
export const SCOPE_REF_SCHEMA = {
	type:                 'object',
	additionalProperties: false,
	required:             ['kind', 'value'],
	properties: {
		kind: {
			type: 'string',
			enum: ['repo', 'module', 'file', 'symbol', 'connection', 'manifest-dir', 'workspace'],
		},
		value: { type: 'string', minLength: 1 },
	},
} as const;

/**
 * Aggregator inputSchema -- common to every per-target terminal
 * aggregator. Free-form because aggregators consume every upstream
 * task's outputs; the runtime injects the materialized values via
 * `consumes`, not via params.
 */
export const AGGREGATOR_INPUT_SCHEMA = {
	type:                 'object',
	additionalProperties: true,
	properties: {},
} as const;

/** Aggregator outputSchema -- one terminal report blob. */
export const AGGREGATOR_OUTPUT_SCHEMA = {
	type:                 'object',
	additionalProperties: true,
	required:             ['report'],
	properties: {
		report: { type: 'object' },
	},
} as const;
