/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Ajv JSON Schema for ClassifiedIntent (the classifier's output).
 *
 * Used by the classifier driver to enforce the structured-output
 * shape at the wire layer (Ollama's `format: schema`) and by the
 * validate.ts layer for cross-field checks (e.g. scopeRef.kind
 * must be compatible with target).
 *
 * Bumping SCHEMA_VERSION should be paired with a classifier
 * prompt revision -- the prompt cites the shape verbatim.
 *
 * See: design/analyze-framework.md "Intent"
 */

import { Ajv, type ErrorObject, type ValidateFunction } from 'ajv';

import type { ClassifiedIntent } from '../../shared/analyze-types.js';

export const CLASSIFIER_SCHEMA_VERSION = 1;

export const TARGET_ENUM = ['code', 'data', 'infra', 'generic', 'docs'] as const;
export const SCOPE_BUCKET_ENUM = ['XS', 'S', 'M', 'L', 'XL'] as const;
export const SCOPE_REF_KIND_ENUM = [
	'repo',
	'module',
	'file',
	'symbol',
	'connection',
	'manifest-dir',
	'workspace',
] as const;

export const CLASSIFIED_INTENT_SCHEMA = {
	$id:        `https://procix.ai/insrc/classified-intent#${CLASSIFIER_SCHEMA_VERSION}`,
	title:      'ClassifiedIntent',
	type:       'object',
	required:   ['target', 'scope', 'focused', 'scopeRef', 'reasoning'],
	additionalProperties: false,
	properties: {
		target:    { type: 'string', enum: [...TARGET_ENUM] },
		scope:     { type: 'string', enum: [...SCOPE_BUCKET_ENUM] },
		focused:   { type: 'boolean' },
		focus:     { type: 'string', minLength: 1 },
		scopeRef:  {
			type:                 'object',
			additionalProperties: false,
			required:             ['kind', 'value'],
			properties: {
				kind:  { type: 'string', enum: [...SCOPE_REF_KIND_ENUM] },
				value: { type: 'string', minLength: 1 },
			},
		},
		reasoning: { type: 'string', minLength: 1 },
	},
} as const;

const ajv = new Ajv({
	allErrors:        true,
	useDefaults:      false,
	removeAdditional: false,
	strict:           false,
});

let _validator: ValidateFunction | null = null;

function getValidator(): ValidateFunction {
	if (_validator === null) {
		_validator = ajv.compile(CLASSIFIED_INTENT_SCHEMA);
	}
	return _validator;
}

export interface IntentValidationResult {
	readonly ok:     boolean;
	readonly errors: readonly string[];
}

export function validateIntentShape(value: unknown): value is ClassifiedIntent {
	const v = getValidator();
	return v(value) as boolean;
}

export function validateIntentShapeWithErrors(value: unknown): IntentValidationResult {
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
