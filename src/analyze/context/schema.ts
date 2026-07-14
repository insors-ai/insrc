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
 *      plans/analyze-context-builder.md Phase 1
 */

import { Ajv, type ErrorObject, type ValidateFunction } from 'ajv';

import type { AnalyzeContextBundle, BundleLayerName } from './types.js';

/**
 * Bumping this constant invalidates every cached bundle. Coordinate
 * with the cache layer (P4) when changing.
 */
export const SCHEMA_VERSION = 1;

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
	},
} as const;

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
