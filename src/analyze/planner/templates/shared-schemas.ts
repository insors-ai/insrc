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
 * The parameters by which an adherence check (code, data, infra) is given the
 * constraints it judges against. Three ways, read in this order; the first
 * that is given is used alone:
 *   1. `constraints`      -- an inline list (an empty list counts as not given);
 *   2. `constraintIds`    -- ids of summarised documents;
 *   3. `constraintTopic`  -- the check looks the constraints up itself, in the
 *                            repository's documents.
 * Every description is shown to the planner with the catalog.
 */
export const ADHERENCE_CONSTRAINT_PARAMS = {
	constraintTopic: {
		type:        'string',
		minLength:   1,
		description: 'The subject of the rules this check judges against, in words a reader of the documents would use (for example "build and test rules for CI workflows"), NOT a file path. The check looks the constraints on it up itself, in the repository\'s documents. This is the usual way to give a check its constraints. Checks of one plan that share a topic judge against the same list.',
	},
	maxConstraintSources: {
		type:        'integer',
		minimum:     1,
		maximum:     30,
		description: 'How many document sections the lookup of `constraintTopic` reads. Leave it out for the default.',
	},
	constraints: {
		type:  'array',
		items: {
			type:                 'object',
			additionalProperties: true,
			required:             ['constraint'],
			properties: {
				constraint:     { type: 'string', minLength: 1 },
				sourceEntityId: { type: 'string' },
				file:           { type: 'string' },
				heading:        { type: 'string' },
			},
		},
		description: 'An inline list of constraints, each quoted from a document you were shown. When given (and not empty) it is used alone: `constraintIds` and `constraintTopic` are not read.',
	},
	constraintIds: {
		type:        'array',
		items:       { type: 'string', minLength: 1 },
		description: 'Ids of summarised documents; their stored key constraints are used. Read when `constraints` is absent or empty; `constraintTopic` is then not read.',
	},
} as const;

/** An adherence check must be given one of the three; plan validation also requires that it is not empty. */
export const ADHERENCE_CONSTRAINT_ANY_OF = [
	{ required: ['constraintTopic'] },
	{ required: ['constraints'] },
	{ required: ['constraintIds'] },
] as const;

/** What an adherence-report adds to its findings: the constraints judged against, and where they came from. */
export const ADHERENCE_REPORT_SOURCE_PROPERTIES = {
	constraints:      { type: 'array' },
	constraintSource: { type: 'object' },
} as const;

/** The sentence every adherence template's description ends with. */
export const ADHERENCE_CONSTRAINTS_DESCRIPTION =
	'Give the check its constraints in one of three ways: `constraintTopic` (the check finds the constraints in the repository\'s documents itself; the usual way), ' +
	'`constraints` (an inline list), or `constraintIds` (ids of summarised documents). A check with none of them is refused.';

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
