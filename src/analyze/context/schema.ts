/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Ajv JSON Schema for AnalyzeContextBundle.
 *
 * Used by the shaper driver (P3) to enforce the LLM's structured
 * output and by the cache (P4) for the schemaVersion component of
 * the cache key. Bumping SCHEMA_VERSION invalidates every cached
 * bundle on next read.
 *
 * Design choices:
 *   - Every layer field is REQUIRED on the wire so the LLM can't
 *     drop one accidentally. "Empty" is conveyed by emitting the
 *     empty string AND listing the layer name in meta.emptyLayers.
 *     This is the dual signal the bundle assembler honors.
 *   - meta is OPTIONAL at the type level (a freshly-constructed
 *     bundle pre-meta-stamp is valid) but the driver always stamps
 *     it before persisting.
 *   - additionalProperties is FALSE so unknown fields fail validation
 *     loudly -- the LLM should not be inventing new bundle keys.
 *
 * Cache key composition (driver P3):
 *   sha256(promptContentHash + schemaVersion + invocationInputsHash)
 *
 * See: design/analyze-context-builder.md "The bundle"
 *      docs/plans/analyze-context-builder.md Phase 1
 */

import { Ajv, type ErrorObject, type ValidateFunction } from 'ajv';

import type { AnalyzeContextBundle, BundleLayerName } from './types.js';

/**
 * Bumping this constant invalidates every cached bundle. Coordinate
 * with the cache layer (P4) when changing.
 */
export const SCHEMA_VERSION = 2;

/*
 * Version history:
 *   1 -- seven layers and meta.
 *   2 -- the optional `report` (LLD-b9d5c5c40df5a574-s1). The version is part
 *        of the bundle cache key, so a bundle cached at version 1, which has
 *        no report, is not served.
 */

/**
 * Layer names the validator accepts in meta.emptyLayers. Kept in sync
 * with BundleLayerName at compile time (the bundle field set is
 * locked here via `Record<BundleLayerName, true>`).
 */
export const BUNDLE_LAYER_NAMES: readonly BundleLayerName[] = Object.freeze([
	'system',
	'focus',
	'summary',
	'structure',
	'surface',
	'artefacts',
	'upstream',
]);

// Type-level guard: if BundleLayerName changes, this object literal stops
// compiling. Keeps schema enum + TS type aligned without a runtime check.
const _LAYER_NAME_GUARD: Readonly<Record<BundleLayerName, true>> = {
	system:    true,
	focus:     true,
	summary:   true,
	structure: true,
	surface:   true,
	artefacts: true,
	upstream:  true,
};
void _LAYER_NAME_GUARD;

/**
 * JSON Schema for AnalyzeContextBundle. Targets draft-07 (Ajv 8's
 * default meta-schema) -- nothing here uses draft-2020-12-specific
 * features, so we let Ajv pick the meta-schema without an explicit
 * `$schema` directive (matches structured-output.ts convention).
 */
export const ANALYZE_CONTEXT_BUNDLE_SCHEMA = {
	$id:        `https://procix.ai/insrc/analyze-context-bundle#${SCHEMA_VERSION}`,
	title:      'AnalyzeContextBundle',
	type:       'object',
	required:   [
		'system',
		'focus',
		'summary',
		'structure',
		'surface',
		'artefacts',
		'upstream',
	],
	additionalProperties: false,
	properties: {
		system:    { type: 'string' },
		focus:     { type: 'string' },
		summary:   { type: 'string' },
		structure: { type: 'string' },
		surface:   { type: 'string' },
		artefacts: { type: 'string' },
		upstream:  { type: 'string' },
		meta: {
			type:                 'object',
			additionalProperties: false,
			required:             [
				'mode',
				'shaper',
				'toolCalls',
				'modelId',
				'emptyLayers',
				'schemaVersion',
			],
			properties: {
				mode: {
					type: 'string',
					enum: ['classification', 'run', 'task'],
				},
				shaper: {
					type: 'string',
					enum: ['classification', 'generic', 'code', 'data', 'infra', 'docs'],
				},
				toolCalls: {
					type:    'integer',
					minimum: 0,
				},
				modelId: {
					type:      'string',
					minLength: 1,
				},
				emptyLayers: {
					type:        'array',
					uniqueItems: true,
					items: {
						type: 'string',
						enum: [...BUNDLE_LAYER_NAMES],
					},
				},
				schemaVersion: {
					type:  'integer',
					const: SCHEMA_VERSION,
				},
				repoLastIndexedAt: {
					type:    'integer',
					minimum: 0,
				},
			},
		},
		// The answer report. Derived by code; see MODEL_FACING_BUNDLE_SCHEMA.
		report: {
			type:                 'object',
			additionalProperties: false,
			required:             ['completeness'],
			properties: {
				completeness: {
					type:                 'object',
					additionalProperties: false,
					required:             ['complete', 'incomplete', 'failed'],
					properties: {
						complete:   { type: 'boolean' },
						incomplete: { type: 'array', items: { $ref: '#/definitions/sourceNote' } },
						failed:     { type: 'array', items: { $ref: '#/definitions/sourceNote' } },
						basisNotes: { type: 'array', items: { type: 'string' } },
					},
				},
				answerFailure: { type: 'string' },
				// Typed by Stories s2 and s3.
				measure:  {},
				handling: {},
			},
		},
	},
	definitions: {
		sourceNote: {
			type:                 'object',
			additionalProperties: false,
			required:             ['sourceId', 'sourceKind', 'reason'],
			properties: {
				sourceId:   { type: 'string', minLength: 1 },
				sourceKind: { type: 'string', enum: ['lookup', 'plan-task'] },
				reason:     { type: 'string' },
			},
		},
	},
} as const;

/**
 * The schema a MODEL is given for the bundle it writes: the stored schema
 * without `report`. The report is derived by code from the lookups' records,
 * so a model must not be able to write one. The schema rejects unknown
 * fields, so a model's answer that carries a `report` fails validation
 * inside the provider and is retried, like any other unknown field.
 *
 * `withMeta: false` also drops `meta`, for the answer-writing call, which
 * writes the seven layers only.
 *
 * Each form is built once and kept: the provider compiles a schema once per
 * object, and a second object with the same `$id` would be refused.
 */
const modelFacing: { withMeta?: Record<string, unknown> | undefined; layersOnly?: Record<string, unknown> | undefined } = {};

export function modelFacingBundleSchema(opts: { readonly withMeta: boolean }): Record<string, unknown> {
	const key = opts.withMeta ? 'withMeta' : 'layersOnly';
	const kept = modelFacing[key];
	if (kept !== undefined) return kept;

	const cloned = JSON.parse(JSON.stringify(ANALYZE_CONTEXT_BUNDLE_SCHEMA)) as Record<string, unknown>;
	const props = cloned['properties'] as Record<string, unknown>;
	delete props['report'];
	delete cloned['definitions'];   // used by `report` only
	if (!opts.withMeta) {
		delete props['meta'];
		cloned['required'] = (cloned['required'] as string[]).filter(k => k !== 'meta');
	}
	// Its own identity: not the stored schema's `$id`.
	delete cloned['$id'];
	modelFacing[key] = cloned;
	return cloned;
}

// ---------------------------------------------------------------------------
// Validator (compiled lazily so test runs that only inspect the schema
// constant don't pay for compilation)
// ---------------------------------------------------------------------------

const ajv = new Ajv({
	allErrors:        true,
	useDefaults:      false,
	removeAdditional: false,
	strict:           false,
});

let _validator: ValidateFunction | null = null;

function getValidator(): ValidateFunction {
	if (_validator === null) {
		_validator = ajv.compile(ANALYZE_CONTEXT_BUNDLE_SCHEMA);
	}
	return _validator;
}

export interface BundleValidationResult {
	readonly ok:     boolean;
	readonly errors: readonly string[];
}

/**
 * Validate `value` against the bundle schema. Returns a typed result
 * with human-readable error messages so the shaper driver's retry
 * prompt can echo them back to the LLM.
 *
 * The narrow `value is AnalyzeContextBundle` type guard is intentional:
 * a successful validation lets the driver treat the parsed JSON as an
 * AnalyzeContextBundle without a second cast.
 */
export function validateBundle(
	value: unknown,
): value is AnalyzeContextBundle {
	const v = getValidator();
	return v(value) as boolean;
}

export function validateBundleWithErrors(value: unknown): BundleValidationResult {
	const v = getValidator();
	const ok = v(value) as boolean;
	if (ok) {
		return { ok: true, errors: [] };
	}
	const errors = (v.errors ?? []).map(formatError);
	return { ok: false, errors };
}

function formatError(e: ErrorObject): string {
	const path = e.instancePath === '' ? '<root>' : e.instancePath;
	const params = JSON.stringify(e.params);
	return `${path}: ${e.message ?? '(no message)'} ${params}`;
}
