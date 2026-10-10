/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Shared JSON Schema fragments every template's inputSchema can
 * compose against. Pinned here so per-template modules don't
 * accidentally diverge on the ScopeRef shape.
 */

import type { AnalyzeTarget } from '../../../shared/analyze-types.js';
import { TARGET_TO_KINDS } from '../../classifier/validate.js';

/**
 * ScopeRef shape for a task of one family (matches AnalyzeScopeRef from
 * shared/analyze-types.ts). Its `kind` lists only the kinds of scope that
 * family accepts, read from the one table the classifier and the runtimes
 * use (`TARGET_TO_KINDS`), so the catalog shown to the planner, the plan
 * validator and the runtime cannot disagree.
 */
export function scopeRefSchemaFor(target: AnalyzeTarget) {
	return {
		type:                 'object',
		additionalProperties: false,
		required:             ['kind', 'value'],
		properties: {
			kind: {
				type: 'string',
				enum: [...TARGET_TO_KINDS[target]],
			},
			value: { type: 'string', minLength: 1 },
		},
	} as const;
}

/**
 * ScopeRef shape with every kind of scope: for an intent whose kind of source
 * is not fixed by the template (a subrun task's `childIntent`). A task's own
 * `scopeRef` uses `scopeRefSchemaFor(<its family>)`.
 */
export const SCOPE_REF_SCHEMA = scopeRefSchemaFor('generic');

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
