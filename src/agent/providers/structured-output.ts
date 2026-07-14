/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Structured-output helpers (plans/structured-output.md Phase A).
 *
 * This module is the shared infrastructure every provider's
 * `completeStructured` implementation builds on. The pattern mirrors
 * `insors-extraction`'s `OpenAISchemaProcessor` + the Instructor
 * library's retry-on-validation-failure flow.
 *
 *   - `validateAgainstSchema(schema, raw)`  -- ajv-backed validator
 *      returning `{ ok: true, value } | { ok: false, errors[] }`.
 *   - `withStructuredRetry(call, validate, maxAttempts)` -- runs the
 *      provider call, validates, on failure re-issues with the
 *      validation errors appended to the conversation. Surfaces a
 *      stable error after `maxAttempts`.
 *   - `processSchemaForOpenAIStrict(schema)` -- direct port of
 *      insors-extraction's OpenAISchemaProcessor. Walks the schema
 *      in place, sets `additionalProperties: false` on every object,
 *      ensures every non-dict property is in `required`, rewrites
 *      `oneOf` -> `anyOf` (strict mode prohibits `oneOf`). Idempotent.
 *
 * Phases B.1-B.5 wire each provider's `completeStructured` through
 * these helpers. Phases C.x migrate callsites away from
 * `JSON.parse(rawText)` to `provider.completeStructured(messages, Schema)`.
 */

import { Ajv, type ErrorObject, type ValidateFunction } from 'ajv';
import { getLogger } from '../../shared/logger.js';
import type { StructuredSchema } from '../../shared/types.js';

const log = getLogger('providers:structured-output');


// ---------------------------------------------------------------------------
// ajv singleton -- one compiled cache shared across the daemon
// ---------------------------------------------------------------------------

/**
 * Singleton ajv instance. Configured for JSON Schema draft 2020-12
 * (which is what typebox emits) with informative error messages.
 *
 * `removeAdditional: false` + `useDefaults: false`: validation only
 * surfaces drift; it doesn't mutate the payload. Providers like OpenAI
 * (strict mode) already reject unknown properties at the wire layer;
 * we don't want ajv to silently strip them downstream.
 *
 * `allErrors: true` so a single failed validation surfaces every
 * issue at once -- the retry prompt then gets the full picture and
 * the LLM can fix everything in one pass.
 */
const ajv = new Ajv({
	allErrors:        true,
	useDefaults:      false,
	removeAdditional: false,
	strict:           false,        // be tolerant of `description`, `examples`, etc. typebox emits
});


// ---------------------------------------------------------------------------
// Public validation surface
// ---------------------------------------------------------------------------

export type ValidationResult<T> =
	| { readonly ok: true;  readonly value: T }
	| { readonly ok: false; readonly errors: readonly string[] };

/**
 * Validate `raw` against `schema`. Returns the typed value or the list
 * of human-readable error messages.
 *
 * ajv-compiled validators are cached on the singleton; the same schema
 * object compiles once per process. Callers SHOULD reuse the same
 * `schema` reference across calls (typebox makes this natural -- the
 * schema is a module-level constant in the callsite's `*-schemas.ts`).
 */
export function validateAgainstSchema<T>(
	schema: StructuredSchema,
	raw:    unknown,
): ValidationResult<T> {
	let validate: ValidateFunction;
	try {
		validate = ajv.compile(schema);
	} catch (err) {
		return { ok: false, errors: [`ajv.compile failed: ${(err as Error).message}`] };
	}
	if (validate(raw)) {
		return { ok: true, value: raw as T };
	}
	const errors = (validate.errors ?? []).map(formatAjvError);
	return { ok: false, errors };
}

function formatAjvError(e: ErrorObject): string {
	const path = e.instancePath.length > 0 ? e.instancePath : '/';
	const msg  = e.message ?? '(no message)';
	// Surface keyword + params for schema-author debugging.
	const detail = e.params !== undefined && Object.keys(e.params).length > 0
		? ` (${JSON.stringify(e.params)})`
		: '';
	return `${path}: ${msg}${detail}`;
}


// ---------------------------------------------------------------------------
// Retry wrapper (Instructor-style)
// ---------------------------------------------------------------------------

/**
 * Caller-supplied function that issues the provider call. Receives an
 * optional `extraSystemNote` -- when set, the call MUST append it as
 * an additional user-side message so the LLM sees the validation
 * feedback from the prior attempt. Returns the raw, unvalidated value
 * the provider produced (a parsed object, NOT a string).
 *
 * On retry the helper appends the feedback note; the provider is
 * responsible for translating the conversation into its wire format
 * (anthropic.ts builds the messages array, gemini-schema-adapter
 * translates, etc.).
 */
export type StructuredCall = (extraSystemNote: string | undefined) => Promise<unknown>;

export type StructuredValidator<T> = (raw: unknown) => ValidationResult<T>;

/**
 * Build the retry-feedback note for attempts 2..N. Historically this
 * said "return valid JSON conforming to the schema" -- which qwen3.6
 * interprets as "be more explicit about what you're producing" and it
 * fence-wraps the response ` ```json ... ``` ` on the retry (ISSUES.md
 * I-003). The reworded note names the two failure modes we've actually
 * seen -- markdown fence wrappers and mid-stream truncation -- so the
 * model knows what NOT to do rather than only what to do.
 */
function buildRetryNote(errors: readonly string[]): string {
	const errorList = errors.length > 0
		? `\n  - ${errors.join('\n  - ')}\n`
		: ' (no structured error captured)';
	return (
		'Your previous response could not be parsed.' + errorList +
		'\n' +
		'Retry with a raw JSON object that conforms to the schema. Rules:\n' +
		'  - Emit the JSON object directly. Do NOT wrap it in a markdown\n' +
		'    code fence (no ```json ..., no ``` ...). The response must\n' +
		'    start with `{` and end with `}`.\n' +
		'  - Do NOT prefix the JSON with explanatory prose (no "Here is\n' +
		'    the JSON:", no "Sure, ..."). The very first character of\n' +
		'    your response must be `{`.\n' +
		'  - Do NOT abbreviate or elide fields with placeholders like\n' +
		'    "..." -- emit every required field in full.\n' +
		'  - Every string value must be complete + properly terminated.\n' +
		'    If a field is at risk of being long, keep it concise rather\n' +
		'    than truncating mid-string.\n' +
		'  - Fix every schema-validation error listed above.'
	);
}


/**
 * Issue the provider call, validate. On validation failure, append
 * the errors as a feedback note + re-issue up to `maxAttempts`. Throws
 * a stable error after exhaustion.
 *
 * This is the Instructor-style retry pattern. The cloud LLM gets
 * three shots; if it can't conform after the third, the call surfaces
 * as a hard error that bubbles up to the orchestrator's existing
 * Phase2Out retry loop (which is the next layer of defence in the
 * meta-task framework).
 *
 * Application-level errors thrown by `call` (e.g. "the model returned
 * text instead of using the forced tool") are treated as retryable
 * validation failures -- the error message becomes the feedback note
 * for the next attempt. Network-level transient errors (5xx, rate
 * limits) should be handled BEFORE reaching this helper, via the
 * per-provider cloud-retry wrapper. They're rare here because the
 * provider's `withCloudRetry` already covers them; if they leak
 * through, we treat them as validation failures and re-issue, which
 * isn't ideal but degrades gracefully.
 */
export async function withStructuredRetry<T>(
	call:         StructuredCall,
	validate:     StructuredValidator<T>,
	maxAttempts:  number,
): Promise<T> {
	if (maxAttempts < 1) {
		throw new Error(`structured-output: maxAttempts must be >= 1; got ${maxAttempts}`);
	}
	let lastErrors: readonly string[] = [];
	for (let attempt = 1; attempt <= maxAttempts; attempt++) {
		const note = attempt === 1
			? undefined
			: buildRetryNote(lastErrors);

		let raw: unknown;
		try {
			raw = await call(note);
		} catch (err) {
			// Application-level error (model didn't use the tool, parse
			// error inside the provider's call closure, etc.). Convert to
			// a validation failure so the next attempt re-issues with the
			// error message as feedback.
			const msg = (err as Error).message ?? String(err);
			lastErrors = [msg];
			log.warn({ attempt, maxAttempts, error: msg }, 'structured-output: call threw; treating as validation failure for retry');
			continue;
		}

		const result = validate(raw);
		if (result.ok) {
			if (attempt > 1) {
				log.info({ attempt, maxAttempts }, 'structured-output: validation passed after retry');
			}
			return result.value;
		}
		lastErrors = result.errors;
		log.warn({ attempt, maxAttempts, errors: lastErrors }, 'structured-output: validation failed; will retry');
	}
	throw new Error(`structured-output: validation failed after ${maxAttempts} attempts: ${lastErrors.join('; ')}`);
}


// ---------------------------------------------------------------------------
// OpenAI strict-mode schema preprocessor
// ---------------------------------------------------------------------------

/**
 * Port of `insors-extraction`'s `OpenAISchemaProcessor`. OpenAI's
 * `response_format: { type: 'json_schema', strict: true }` rejects
 * schemas that don't meet three rules:
 *
 *   1. Every object MUST declare `additionalProperties: false` UNLESS
 *      it's a "pure dictionary" (the only property is an
 *      `additionalProperties` schema with no fixed `properties`).
 *   2. Every non-dictionary property MUST appear in the `required`
 *      array. (Strict mode treats every property as required; optional
 *      fields are modelled via union with `null`.)
 *   3. `oneOf` is prohibited. Rewrite to `anyOf` -- semantics differ
 *      only when multiple branches match, which strict-mode schemas
 *      shouldn't allow anyway.
 *
 * Mutates the schema in place AND returns it (caller can use either
 * pattern). Idempotent: running twice == running once.
 */
export function processSchemaForOpenAIStrict(schema: StructuredSchema): StructuredSchema {
	processInPlace(schema as Record<string, unknown>);
	return schema;
}

function processInPlace(node: unknown): void {
	if (Array.isArray(node)) {
		for (const item of node) { processInPlace(item); }
		return;
	}
	if (typeof node !== 'object' || node === null) { return; }
	const obj = node as Record<string, unknown>;

	// Rewrite oneOf -> anyOf BEFORE recursing into branches.
	if (Array.isArray(obj['oneOf'])) {
		obj['anyOf'] = obj['oneOf'];
		delete obj['oneOf'];
	}

	// Object-type schemas need additionalProperties:false + full required.
	if (obj['type'] === 'object') {
		const properties = obj['properties'];
		const hasFixedProps = isObject(properties) && Object.keys(properties).length > 0;
		const isPureDictionary = !hasFixedProps && isObject(obj['additionalProperties']);
		if (!isPureDictionary) {
			if (obj['additionalProperties'] === undefined) {
				obj['additionalProperties'] = false;
			}
			if (hasFixedProps) {
				const propsObj = properties as Record<string, unknown>;
				obj['required'] = Object.keys(propsObj);
			}
		}
	}

	// Per-property MAPS: each value is itself a schema. `properties`,
	// `patternProperties`, `definitions`, `$defs` all have this shape.
	for (const mapKey of ['properties', 'patternProperties', 'definitions', '$defs'] as const) {
		const m = obj[mapKey];
		if (isObject(m)) {
			for (const k of Object.keys(m)) {
				processInPlace(m[k]);
			}
		}
	}

	// Single-schema fields. `items` can be a single schema OR an array
	// (tuple validation); processInPlace handles both via its
	// Array.isArray fast-path.
	for (const schemaKey of ['items', 'additionalProperties', 'not', 'if', 'then', 'else'] as const) {
		if (obj[schemaKey] !== undefined) {
			processInPlace(obj[schemaKey]);
		}
	}

	// Schema-array fields. Each entry is itself a schema.
	for (const arrKey of ['anyOf', 'allOf'] as const) {
		const arr = obj[arrKey];
		if (Array.isArray(arr)) {
			for (const item of arr) { processInPlace(item); }
		}
	}
}

function isObject(x: unknown): x is Record<string, unknown> {
	return typeof x === 'object' && x !== null && !Array.isArray(x);
}


// ---------------------------------------------------------------------------
// Stable error builder for "not implemented" provider stubs
// ---------------------------------------------------------------------------

/**
 * Phases B.1-B.5 land per-provider implementations one at a time. Each
 * provider that hasn't migrated yet exports a `completeStructured` that
 * throws this stable error. Callers gated on `capabilities.structuredOutput`
 * never hit it in production; tests gated on the same flag see a clear
 * "not yet implemented" rather than a malformed response.
 */
/**
 * Anthropic's `tools[].input_schema` requires a top-level
 * `type: 'object'` declaration. TypeBox `Type.Union([Type.Object(...),
 * ...])` renders as `{ anyOf: [{type:'object', ...}, ...], title }` with
 * no root `type`, which Anthropic rejects with HTTP 400.
 *
 * This adapter clones the schema and injects `type: 'object'` at the
 * root iff:
 *   - the root has no `type` field, AND
 *   - the root is a discriminated union (anyOf / oneOf) whose every
 *     branch declares `type: 'object'`.
 *
 * Anything else is returned unchanged so an upstream-incompatible schema
 * still surfaces as an API error rather than getting silently rewritten.
 */
export function normaliseSchemaForAnthropic(schema: StructuredSchema): StructuredSchema {
  const root = schema as Record<string, unknown>;
  if ('type' in root) {
    return schema;
  }
  const branches = (root['anyOf'] ?? root['oneOf']) as unknown;
  if (!Array.isArray(branches) || branches.length === 0) {
    return schema;
  }
  const allObject = branches.every(b =>
    b !== null && typeof b === 'object' && (b as Record<string, unknown>)['type'] === 'object',
  );
  if (!allObject) {
    return schema;
  }
  return { ...root, type: 'object' };
}

export function notImplementedStructuredOutput(provider: string): never {
	throw new Error(
		`structured-output: provider '${provider}' does not implement completeStructured yet. `
		+ `Gate the callsite on \`provider.capabilities.structuredOutput\` and route through `
		+ `\`provider.complete\` until the per-provider phase lands.`,
	);
}
